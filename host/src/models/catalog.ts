import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelChoice } from "../story/state.js";

type Provider = ModelChoice["provider"];

/** A model a provider offers, as the Models screen shows it. */
export interface OfferedModel {
  /** The id the provider is asked for. */
  id: string;
  /** Other ids that mean the same model ("opus" for Claude's claude-opus-5-5), so an older setting still matches. */
  aliases: string[];
  /** As people write it: "GPT 6.1 Sol". */
  name: string;
  /** The efforts it supports, lowest first; empty when it has none. */
  efforts: string[];
  defaultEffort: string | null;
}

/** How to ask each provider what it offers. */
export type ModelListers = Record<Provider, () => Promise<OfferedModel[]>>;

export interface ProviderOffer {
  provider: Provider;
  label: string;
  reachable: boolean;
  reason: string | null;
  models: OfferedModel[];
}

const PROVIDERS: readonly Provider[] = ["claude", "codex", "antigravity"];
const PROVIDER_NAMES: Record<Provider, string> = { claude: "Claude", codex: "Codex", antigravity: "Antigravity" };
const HOUR = 60 * 60 * 1000;

/**
 * What each provider offers (models-screen design decision 4), asked of the provider itself when the host starts and
 * every hour. The last list each gave is kept in catalog.json in the Mac's folder; when a provider cannot be asked,
 * that list is shown, marked unreachable, with the reason.
 */
export class Catalog {
  private kept: Partial<Record<Provider, OfferedModel[]>>;
  private readonly unreachable = new Map<Provider, string>();

  constructor(private readonly home: string, private readonly listers: ModelListers) {
    this.kept = existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) as Partial<Record<Provider, OfferedModel[]>> : {};
  }

  private get file(): string {
    return join(this.home, "catalog.json");
  }

  /** Asks every provider at once; one that cannot be asked keeps what it last offered. */
  async refresh(): Promise<void> {
    await Promise.all(PROVIDERS.map(async provider => {
      try {
        this.kept[provider] = await this.listers[provider]();
        this.unreachable.delete(provider);
      } catch (error) {
        this.unreachable.set(provider, error instanceof Error ? error.message : String(error));
      }
    }));
    const writing = `${this.file}.writing`;
    writeFileSync(writing, `${JSON.stringify(this.kept, null, 2)}\n`);
    renameSync(writing, this.file);
  }

  /** Refreshes now and then every hour, until the returned function is called. */
  start(every = HOUR): () => void {
    void this.refresh();
    const timer = setInterval(() => void this.refresh(), every);
    timer.unref();
    return () => clearInterval(timer);
  }

  view(): ProviderOffer[] {
    return PROVIDERS.map(provider => ({
      provider,
      label: provider.toUpperCase(),
      reachable: !this.unreachable.has(provider),
      reason: this.unreachable.get(provider) ?? null,
      models: this.kept[provider] ?? []
    }));
  }

  /** "GPT 6.1 Sol · high"; a model the catalog has never seen is named by its id. */
  label(choice: ModelChoice): string {
    const name = this.find(choice)?.name ?? choice.model;
    return choice.effort ? `${name} · ${choice.effort}` : name;
  }

  /**
   * Whether the provider offers this model at this effort. A provider whose list is not known (never reached) cannot
   * be checked, so nothing is refused for it.
   */
  offers(choice: ModelChoice): boolean {
    return this.refusal(choice) === null;
  }

  /** Why the provider does not offer this choice, in words the player can read; null when it does. */
  refusal(choice: ModelChoice): string | null {
    const known = this.kept[choice.provider];
    if (!known || known.length === 0) return null;
    const model = this.find(choice);
    if (!model) return `${PROVIDER_NAMES[choice.provider]} does not offer ${choice.model}.`;
    if (choice.effort && !model.efforts.includes(choice.effort)) return `${model.name} has no effort ${choice.effort}.`;
    return null;
  }

  private find(choice: ModelChoice): OfferedModel | undefined {
    return this.kept[choice.provider]?.find(model => model.id === choice.model || model.aliases.includes(choice.model));
  }
}
