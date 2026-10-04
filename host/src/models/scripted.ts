import type { ModelRequest, ModelRunner } from "./model-call.js";

/** What a scripted model does with one call: answer with this text, or fail with this reason. */
export type Script = { answer: string } | { fail: string };

/**
 * A model that answers from a script instead of a provider, word by word as a real one streams. Every scenario
 * test runs on it, so the Story's behaviour is proven without spending quota and gives the same result every
 * time. `fantasia serve --fake-models` uses it too, for the phone's end-to-end tests.
 */
export class ScriptedRunner implements ModelRunner {
  readonly requests: ModelRequest[] = [];
  private readonly scripts: Script[];

  constructor(scripts: Script[] = [], private readonly fallback: (request: ModelRequest) => Script = () => ({ answer: "She looks at you, and waits." })) {
    this.scripts = [...scripts];
  }

  /** Queues what the next calls will do. */
  then(...scripts: Script[]): this {
    this.scripts.push(...scripts);
    return this;
  }

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    this.requests.push(request);
    const script = this.scripts.shift() ?? this.fallback(request);
    if ("fail" in script) throw new Error(script.fail);
    const words = script.answer.split(/(?<=\s)/);
    for (const word of words) {
      signal.throwIfAborted();
      await new Promise(resolve => setImmediate(resolve));
      onText(word);
    }
    return script.answer;
  }
}
