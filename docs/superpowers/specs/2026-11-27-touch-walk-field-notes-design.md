# Walking by touch and opening Field notes

The visitor can tap visible ground to approach a spot, drag to look around and tap the front doorway to pass through. Movement uses the existing walker, collision rules and cabin passage. A new gesture, keyboard movement or opening the notebook stops a tap walk. Portrait arrival frames the path and door. A remembered position and gaze take precedence over the arrival framing.

Field notes occupies the labeled header action. The notebook leads with current observations on the first visit and with a recap on a return visit. Storage information lives beside the memory control. Return becomes available away from the starting view. The existing light studies remain under the wordmark.

## As built

All 902 Node tests passed during local verification. The HTTP catch-up test ran separately so its disposable server could bind to localhost.

On a 390 × 844 Chromium touch viewport, the visitor tapped the path, opened Field notes while walking, closed the notebook at the same position, entered the cabin, dragged to turn around, tapped the doorway to leave and returned to the portrait starting view. Desktop checks exercised keyboard movement, notebook focus restoration and the painting's Keep dialog. No physical phone was available for verification.

The [Field notes browser report](../../field-notes-validation/browser-results.json) records 87 passing checks. The notebook stays anchored when a group expands, its event name stays visible while the dates scroll, and Close stays in the header. Undo restores the recap, reading progress and saved position until the visitor closes the notebook. The painting capture suite passed 62 checks, including controls at 320, 390, 800 and 1440 pixels, exports, error handling and keyboard focus.

The phone position-reset button reads **Back to view**. In a light study, **Return to live** restores the shared time. At 812 × 375, desktop Walking help opened beside the caption and Return to live accepted a click with help open. At 320 × 568 and 390 × 844, a second tap at the same coordinates closed help in Chromium touch emulation. Inside the cabin the instructions began “Tap the floor to walk.”
