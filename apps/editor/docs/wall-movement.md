# Moving connected walls

In 3D or Top view, select a wall and choose Move (`G`). Drag its purple center arrow, or drag the selected wall itself, to slide the complete wall perpendicular to its length. The two endpoint spheres remain available for changing individual corners.

The temporary preview uses the same connected geometry operation and validation as the committed edit. Shared corners, adjoining wall endpoints, room boundaries, openings and hosted components follow the wall. Grid snapping uses 0.05 m increments for wall movement. Release to apply the entire connected change as one undo step; Escape, pointer cancellation, changing tools or changing views cancels the preview. Clicking a handle without moving creates no edit.

Locked geometry and invalid changes are rejected without changing the document. Moving past an adjoining wall, reversing a room boundary, disconnecting a T junction, or shortening a connected wall so its openings no longer fit is rejected. An angled T junction that would need a new intersection calculation remains constrained to its existing host segment. Furniture stays in place and any resulting placement conflicts use the existing project warnings.
