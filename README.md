# Collaborate

**A link is the room.**

Dead-simple, free, no-login collaborative brainstorming spaces. Create a space, share the link, collaborate in real time.

## Features

- **Instant Spaces**: Create a collaborative space by just choosing a name. No signup required.
- **Real-time Collaboration**: See changes from everyone instantly via Server-Sent Events (SSE).
- **Live Cursors**: See other users' cursors with random colors and labels (Guest 1, Guest 2, etc.)
- **Join Notifications**: Subtle notification when someone joins the space.
- **Infinite Canvas**: Pan and zoom freely across an endless workspace.
- **Multiple Content Types**:
  - Sticky notes (6 colors)
  - Text cards
  - Shapes (rectangle, circle, triangle, diamond, star, hexagon, arrow, line)
  - Images (via URL)
  - Emojis
  - Freehand drawings (with color picker)
  - Links (clickable, with URL preview)
- **Intuitive Interactions**:
  - Drag to move items (smooth, fluid movement)
  - Resize items
  - Double-click to edit text
  - Double-click on canvas to create sticky note
  - Color picker for sticky notes, shapes, and drawings
  - Keyboard shortcuts (Delete/Backspace to delete, Escape to deselect)
  - Pan mode (hand tool) for easy canvas navigation
  - Select mode (pointer) for item selection
- **Export**: Export canvas as PNG image
- **Persistent Storage**: All changes are saved to the backend.
- **Share Easily**: Copy the space URL with one click.
- **Optimistic UI**: Smooth, responsive drag and updates.

## Tech Stack

### Frontend (webapp/)
- React 18 with Vite
- TypeScript
- Tailwind CSS + shadcn/ui components
- Framer Motion for animations
- React Query for data fetching
- React Router for routing

### Backend (backend/)
- Bun runtime
- Hono web framework
- Prisma ORM with SQLite
- Zod validation
- Server-Sent Events for real-time updates

## Project Structure

```
webapp/                    # Frontend React app
├── src/
│   ├── components/
│   │   └── canvas/       # Canvas components (Canvas, StickyNote, etc.)
│   ├── hooks/
│   │   └── use-canvas.ts # Canvas state management
│   ├── lib/
│   │   └── space-api.ts  # API client
│   └── pages/
│       ├── Index.tsx     # Landing page
│       └── Space.tsx     # Canvas page

backend/                   # Backend API server
├── prisma/
│   └── schema.prisma     # Database schema
├── src/
│   ├── routes/
│   │   └── spaces.ts     # Space API routes
│   ├── sse.ts            # SSE pub/sub system
│   └── types.ts          # Shared Zod schemas
```

## API Endpoints

- `GET /api/spaces/:slug` - Get or create a space
- `POST /api/spaces/:slug/items` - Create a canvas item
- `PATCH /api/spaces/:slug/items/:itemId` - Update a canvas item
- `DELETE /api/spaces/:slug/items/:itemId` - Delete a canvas item
- `DELETE /api/spaces/:slug` - Reset (clear) a space
- `GET /api/spaces/:slug/events` - SSE endpoint for real-time updates

## Usage

1. Visit the landing page
2. Enter a space name (e.g., "team-brainstorm")
3. Share the URL with collaborators
4. Start adding sticky notes, shapes, text, and more
5. See everyone's changes in real-time

## Space Name Rules

- 3-50 characters
- Lowercase letters, numbers, and hyphens only
- Examples: `team-brainstorm`, `product-ideas`, `design-sprint`
