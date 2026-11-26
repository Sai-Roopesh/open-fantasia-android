# A check sets right what it can, and asks again only for what was lost

An agent's answer is checked part by part (lasting-records). A part the Story cannot use is left out, and the agent
is asked once more, with the problems named (docs/adr/0004). Each repair is a second call to the model, and in play
that took 20 to 80 seconds at almost every Scene's end. Many of the parts sent back were ones the Mac could set right
from its own record: a person named with a title, a mark on a happening that carries nothing, or the time of
something he missed. So a check now sets right what it can, and only what it leaves out is sent back. A line is left
out as too long only when it runs well past the length asked, since a model cannot count words exactly.

## Considered options

- **Ask again for every problem (as before).** It was slow, and the second answer was usually the first with the
  same fix the Mac could have made.
- **Never ask again.** That would lose real repairs: a quote not on the page, or a Scene that matters with no time.
