# The garden's year — design

Lines marked **(call)** are the builder's proposals, not the owner's decisions.

## Intent

The kitchen garden in the walkable yard (`?space=1`) is a fixed late-summer picture. The owner wants it to live through the world's year as a real garden does: the plants grow, fruit and die, and each year the crops are planted in a different part of the beds. A visitor who comes back day after day should see the garden further along than they left it.

## What the owner decided

- The plants grow, fruit and die like in a real garden.
- The crops rotate: after each planting they stand in a different part of the garden.
- Rotation happens **once a year**, not with each of the four seasons.
- The crops are redrawn when the world day changes (approach 1 below). The owner left the how to the builder and did not object to this pick.

## Background a builder needs

- The world clock is `calendar(epoch, now)` in `shared/world.js`. It gives `day` (whole world days since the start), `dayOfYear` (0–364) and `season`. Winter is days 355–78, spring 79–171, summer 172–264, autumn 265–354. The place is at 49° north.
- A world year is 30 real days. One world day is about 1 h 58 min of real time; a visitor returning daily sees about 12 world days pass.
- Every visitor shares the same clock. Nothing about the garden is stored on the server.
- Today the garden is built once: `gardenPlan(space, dressing)` in `shared/lakeside-dressing.js` places the plants, and `buildGarden` in `public/space/scene/garden.js` draws beds, soil, stems and leaf cards as four merged meshes. `buildScene` in `public/space/scene/index.js` holds it as the `garden` part. `SpaceView.render` in `public/space/space-view.js` has the calendar every frame.
- The two beds are `space.beds` in `shared/lakeside-space.js` (ids `corn` and `tomato`), each also a collider. The corn bed holds the corn in its north two-thirds and the bean teepee at its south end; the tomato bed holds the tomatoes.

## Goals

- Each crop passes through a year: bare soil, seedlings, growth, flower, fruit, ripening, yellowing, dry standing remains, cleared soil.
- The change between one world day and the next is small enough that nothing appears to jump, except at the events a gardener causes (planting out, putting up or taking down poles and stakes, picking, clearing).
- Each year every crop stands in a different plot from the year before.
- Every visitor sees the same garden at the same moment, from the world date alone.
- The garden at any date can be built directly, without having built the days before it.

## Non-goals

- Seasons for anything outside the beds: the oak, grass, flowers, grove and hills stay as they are. Winter beds will sit under a green oak until that is taken up separately. **(call)**
- A gardener seen at work. Planting, picking and clearing happen unseen between one day and the next. **(call)**
- Weather affecting growth, good and bad years, pests, the bird using the garden, snow. **(call)**
- New crops beyond corn, beans and tomatoes.
- Any change to the default 2D painting, to what it downloads, to the written scene description, the field notes, or sound. **(call)**
- Any server or stored state.
- Re-exporting the painted art.

## Anti-goals

- Hiding the cottage's front-left window from the arrival spot, in any year of the rotation, at any date. Its light is a shared fact.
- Plants that pop between a few fixed stages.
- A garden that differs between two visitors looking at the same moment.
- A visible hitch in the frame when the garden is redrawn.
- Beds that move, or a walkable area that changes: the colliders and the ground cover stay exactly as they are.

## Approaches

1. **Redraw the crops when the world day changes — chosen.** A pure function turns the world day into each plant's plot, size and stage; the existing builder draws that; the crop meshes are replaced when `calendar.day` changes. It reuses nearly all of `garden.js`, any date can be built and tested directly, and one day's growth is a small step. Cost: a rebuild of a few hundred cards about every two real hours, which must not be felt.
2. **Grow in the shader.** Build every plant full-grown and drive a growth value per card. Smooth to the second, but lengthening stalks, fruit appearing and being picked, and plots swapping do not reduce to one value, and it would change the card material that every other plant in the yard shares.
3. **A handful of pre-built stages, swapped.** Simplest to draw, but plants visibly jump from stage to stage, which is the anti-goal.

## Design

### The plots and the rotation

- Each bed is divided across its length into two equal plots, giving four plots of about 1.3 m by 1.2 m. **(call)**
- Three plots carry the three crops; the fourth rests for the year under a straw-coloured mulch. Each year every crop, and the rest, moves one plot along, so the arrangement repeats every four years and every crop visits every plot. **(call)** The alternative considered was three unequal plots as the beds are divided today; the bean teepee's plot is too small to take the corn or a row of tomatoes.
- The garden year is `Math.floor(calendar.day / 365)`. The beds are bare across the turn of the year, so the change of plots is never seen happening.
- Planting adapts to the plot: corn as a block of three rows of three, the bean poles as a teepee in the middle of the plot, the tomatoes two by two, each with its stake. Counts stay as `dressing.garden` gives them. **(call)**
- **The window.** Limiting height cannot keep the window clear: a reviewer's measurement from the arrival eye found the line of sight to the window's sill passes within a few centimetres of the soil, so any plant standing in that line hides it. No plot stands in that line; the risk is sideways. The plantable soil in the south plot of each bed comes within about 0.4–0.5 m of the line to the window's left edge, and corn leaves reach 0.6–0.8 m from the stalk. The north plots have about 1.8 m to spare. These figures are the reviewer's and the builder confirms them. So in the two south plots the planting is shifted toward the north of the plot, and leaves on the window side are kept short, until nothing crosses the window's outline; every crop still visits every plot. The outline includes the casement leaf standing fully open. **(call)**
- The bed ids `corn` and `tomato` no longer describe what grows there. Renaming them is the builder's choice; the colliders and the cover's exclusion must not move.

### The year in the beds

Day of year, for a plant with no offset. Each plant is a few days early or late by its own seed (within about ±5 days), and each year's plants have new seeds, so no two years are identical. **(call, all dates)**

| Days | Corn | Beans | Tomatoes |
|------|------|-------|----------|
| 320–109 | bare soil, weathered | bare soil | bare soil |
| 110–124 | soil freshly dug, darker | soil dug; poles go up at 120 | soil dug |
| 125–135 | sown at 125, shoots at 135 | sown at 130, shoots at 138 | set out at 135 as small plants, each with its stake |
| 136–199 | grows to full height by about 200 | vines climb to the top of the poles by about 190 | fills out by about 200; flowers from 170 |
| 185–230 | tassels at 200, ears set at 215 | in flower 185–230, pods from 200 | green fruit from 195 |
| 220–264 | ears fill, husks pale by 255 | pods hang; leaves full | fruit ripens green to orange to red, a few at a time; ripe fruit is picked, so the count rises then falls |
| 265–290 | leaves yellow from the bottom up, then straw | leaves yellow and thin | leaves yellow; last fruit; blackened by the first frost about 285 |
| 291–319 | dry stalks stand, ears gone; cut down at 315 | dead vines on the poles; poles down at 318 | cleared at 300; stakes out |

- The resting plot's mulch is laid at day 115 and lifted at day 318, paler as the year goes on. All four plots are bare soil over the turn of the year, so the rest moving on is not seen either. Both days are event days for the continuity test. **(call)**
- Soil colour follows the table: dark when dug, drying paler through summer, weathered in winter.
- Each plant's stage is a set of continuous values of the day (for example height share, leaf share, flower share, fruit count and ripeness, yellowing, dryness), not a named stage. Growth follows an S-curve: slow, fast, levelling off. **(call)**
- Young and dry plants sway differently from full ones: seedlings barely, dry corn stiffly. The amounts are the builder's.

### Where the code goes

- **Shared, pure** (a new `shared/garden-life.js`, with the layout staying in `shared/lakeside-dressing.js`): given the space, the dressing and a world day, return the beds, the four plots with what each carries this year, and every plant with its place, seed and stage values. No clock, no randomness beyond the seeded streams. `gardenPlan` gains the year, or is replaced; its present tests are rewritten to match. **(call)**
- **Scene** (`public/space/scene/garden.js`): boards are built once. Soil and crops are rebuilt for a given day. `buildGarden` returns a way to set the day; `buildScene` exposes it beside `setPathLights`; `SpaceView.render` passes `calendar.day` every frame and the garden does nothing unless the day differs from the one drawn. Replaced geometry is disposed. The card material is shared and is not rebuilt.
- **Colours** are a function of the stage values: green to yellow to straw to grey-brown, in the same linear tints `garden.js` uses now.
- The light studies (`dawn`, `day`, `dusk`, `night`, `rain`) keep the world day, so the garden in a study is the garden of that day. Reduced motion does not freeze the garden: a day's step is not motion. **(call)**
- **Seeing any date.** The yard's existing check fixture (`this.check` / `this.fixture` in `space-view.js`) gains a garden day, so a capture can be taken at any date without waiting. It is not offered to visitors. **(call)**

### Tests

- The plan for a day is deterministic and the same on repeated calls.
- Over four consecutive years each crop stands in four different plots, and no two crops share a plot.
- Every plant stands inside its plot and on its bed's soil, in every year.
- For every day of four years: stage values are finite and in range; between consecutive days no continuous value moves by more than a small bound, except on the listed event days.
- Out of season there are no plants; supports are present only between their up and down days.
- Fruit count rises, then falls to nothing; ripeness never goes backwards.
- For every tenth day of four years the scene builds with finite geometry, and after setting a new day the old geometry has been disposed.
- Setting the same day twice builds nothing.
- The beds' colliders and the cover's count are unchanged from before this work.
- The window: for every year, at the day of fullest growth, no stalk, pole, stake, leaf or fruit reaches into the window's outline, casement open, as seen from the arrival eye.

### Check by eye

A contact sheet from the arrival spot at about twelve dates through one year, and at midsummer for each of the four years, plus a walk round the beds at seedling, full and dry stages. The frame time across a day change is measured and must show no spike a visitor would notice.

## Something to know before it ships

The garden will show whatever the world date says on the day this goes live. If that is winter, the beds a visitor has seen full will be bare soil until spring, up to about two real weeks.

## Left to the builder

Exact dates within a few days of the table, growth curves, colours, sway amounts, the plants' offsets, how seedlings and dry remains are drawn, the mulch, the names of functions and of the beds, how far the south plots' planting is shifted and trimmed, and how the fixture carries the garden day.
