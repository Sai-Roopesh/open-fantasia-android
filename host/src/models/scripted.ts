import { NO_LOOKUPS_LEFT, NO_TOOLS, webLookup, type CanLookUp, type ModelRequest, type ModelRunner, type Tools } from "./model-call.js";

/** One lookup a scripted model makes: one of the Story's tools by name, or the web's own `web_search` and `web_fetch`. */
export interface Lookup {
  tool: string;
  args: Record<string, string | number>;
}

/**
 * What a scripted model does with one call: answer with this text, fail with this reason, work it out from the call,
 * or look things up first and then do what follows, which may be worked out from what the lookups answered.
 */
export type Script = { answer: string } | { fail: string } | { from: (request: ModelRequest) => Script }
  | { lookUp: Lookup[]; then: Script | ((answers: string[]) => Script) };

/**
 * A model that answers from a script instead of a provider, word by word as a real one streams. Every scenario
 * test runs on it, so the Story's behaviour is proven without spending quota and gives the same result every
 * time. `fantasia serve --fake-models` uses it too, for the phone's end-to-end tests. It can use every tool unless
 * it is made without them, and looks things up as its script says, within the call's budget like any model.
 */
export class ScriptedRunner implements ModelRunner {
  readonly requests: ModelRequest[] = [];
  /** Every lookup it made, with what it was answered. */
  readonly looked: (Lookup & { answer: string })[] = [];
  private readonly scripts: Script[];

  constructor(
    scripts: Script[] = [],
    private readonly fallback: (request: ModelRequest) => Script = () => ({ answer: "She looks at you, and waits." }),
    readonly canLookUp: CanLookUp = { story: true, web: true }
  ) {
    this.scripts = [...scripts];
  }

  /** Queues what the next calls will do. */
  then(...scripts: Script[]): this {
    this.scripts.push(...scripts);
    return this;
  }

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal, tools: Tools = NO_TOOLS): Promise<string> {
    this.requests.push(request);
    let script = this.scripts.shift() ?? this.fallback(request);
    for (;;) {
      if ("from" in script) {
        script = script.from(request);
      } else if ("lookUp" in script) {
        const answers = script.lookUp.map(lookup => {
          const answer = lookUp(lookup, tools);
          this.looked.push({ ...lookup, answer });
          return answer;
        });
        script = typeof script.then === "function" ? script.then(answers) : script.then;
      } else {
        break;
      }
    }
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

/** One scripted lookup, through the call's tools as a provider would make it. */
function lookUp(lookup: Lookup, tools: Tools): string {
  if (lookup.tool === "web_search" || lookup.tool === "web_fetch") {
    if (!tools.web) return `There is no tool called ${lookup.tool}.`;
    const searched = lookup.tool === "web_search";
    const what = String(searched ? lookup.args.query : lookup.args.url);
    if (!tools.ask(searched ? webLookup.searched(what) : webLookup.read(what))) return NO_LOOKUPS_LEFT;
    return searched ? `(Scripted results for “${what}”.)` : `(The scripted page at ${what}.)`;
  }
  if (!tools.story.some(spec => spec.name === lookup.tool)) return `There is no tool called ${lookup.tool}.`;
  return tools.use(lookup.tool, lookup.args);
}
