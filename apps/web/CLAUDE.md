# CLAUDE.md - Frontend (Next.js Web App)

This file provides guidance to Claude Code when working on the Certivo Next.js frontend application.

## Project Overview

**Type:** Next.js 14 App Router application
**Purpose:** Multi-tenant compliance management dashboard with BOM tracking, supplier management, risk assessment, and AI-powered operations (CORA)
**Port:** 3000 (development)

## Quick Start

```bash
# From repo root
cd apps/web

# Install dependencies (if needed)
pnpm install

# Set environment variables
export CERTIVO_API_URL="http://localhost:4000"
export CERTIVO_API_TOKEN="<token-from-generate-dev-token>"

# Start dev server
pnpm dev

# Build for production
pnpm build

# Lint
pnpm lint
```

## Technology Stack

- **Next.js 14** - App Router, Server Components, API Routes
- **React 18** - Functional components with hooks
- **TypeScript** - Strict mode, path aliases
- **Tailwind CSS** - Utility-first styling with custom theme
- **TanStack Table v8** - Data tables with sorting/filtering
- **TanStack Virtual v3** - Virtualized scrolling for large datasets
- **Recharts** - Chart visualizations (pie, line, scatter)
- **clsx** - Conditional class names

### Notable Absences (Intentional)
- ❌ No state management library (Redux, Zustand) - using Context API + local state
- ❌ No data fetching library (React Query, SWR) - using native fetch
- ❌ No form library (React Hook Form, Formik) - using controlled components
- ❌ No component library (shadcn/ui, MUI) - custom components
- ❌ No animation library - using CSS transitions

## Architecture Patterns

### 1. Server Components First

**Default:** All components are Server Components unless marked with `"use client"`

```typescript
// Server Component (default)
export default async function DashboardPage() {
  const snapshot = await fetchDashboardSnapshot();
  return <BomExplorer rows={snapshot.bom.items} />;
}

// Client Component (interactive)
"use client";
export default function BomUploader() {
  const [file, setFile] = useState<File | null>(null);
  // ...
}
```

**Force dynamic rendering:**
```typescript
export const dynamic = "force-dynamic";
```
All pages use this to skip static generation and fetch fresh data on every request.

### 2. BFF Pattern (Backend for Frontend)

All API routes in `app/api/` act as thin proxies to the backend:

```typescript
// app/api/dashboard/snapshot/route.ts
export async function GET() {
  try {
    const snapshot = await certivoApiFetch<DashboardSnapshot>('/dashboard/snapshot');
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'API failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Benefits:**
- Type-safe API communication
- Security (JWT token on server only)
- Request transformation layer
- Simplified client-side code

### 3. Component Organization by Domain

```
components/
├── ui/                 # Shared primitives (SectionCard)
├── compliance/         # BOM & certificate management
├── cora/              # AI operations
├── dashboard/         # Dashboard widgets
├── documents/         # Document management
├── ops-center/        # Operations monitoring
├── rbac/              # Role-based access control
├── risk-impact/       # Risk simulation
└── supplier/          # Supplier management
```

**Naming convention:** `kebab-case.tsx` for all files

### 4. State Management Strategy

#### Global State: Context API
```typescript
// app/providers.tsx
const RoleContext = createContext<RoleContextType>({ role: "analyst", setRole: () => {} });

// Usage
const { role, setRole } = useRole();
```

**Only used for:** User role state (viewer | analyst | admin)

#### Local State: useState
```typescript
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [data, setData] = useState<Data | null>(null);
```

#### Server State: Props from Server Components
```typescript
// Server component fetches
const snapshot = await fetchDashboardSnapshot();

// Passes to client component
<BomExplorer rows={snapshot.bom.items} />
```

**No caching or revalidation** - every page load fetches fresh data.

### 5. Data Fetching Patterns

#### Server-Side Fetching
```typescript
// lib/api/dashboard.ts
export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  return certivoApiFetch<DashboardSnapshot>('/dashboard/snapshot');
}

// app/page.tsx
export default async function DashboardPage() {
  const snapshot = await fetchDashboardSnapshot();
  return <ClientComponent data={snapshot} />;
}
```

#### Client-Side Fetching
```typescript
"use client";
export default function BomUploader() {
  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/compliance/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };
}
```

### 6. Type Safety & Imports

#### Import types from backend modules
```typescript
import type { DashboardSnapshotDto } from '@certivo/dashboard';
import type { SupplierScorecardDto } from '@certivo/supplier';

// Re-export with domain aliases
export type DashboardSnapshot = DashboardSnapshotDto;
export type DashboardBomRow = DashboardSnapshot['bom']['items'][number];
```

**No type duplication** - single source of truth in backend DTOs.

#### Path aliases
```typescript
import { SectionCard } from '@/components/ui/section-card';
import { certivoApiFetch } from '@/lib/api/client';
import type { DashboardSnapshot } from '@/lib/types/dashboard';
```

### 7. Role-Based Access Control (RBAC)

```typescript
import { RoleGate } from '@/components/rbac/role-gate';

<RoleGate
  allow={["analyst", "admin"]}
  fallback={<LockedCard message="Analyst access required" />}
>
  <SensitiveContent />
</RoleGate>
```

**Roles:** `viewer` | `analyst` | `admin`

**Note:** This is UI-only authorization. Backend enforces real permissions via JWT.

## Styling Guidelines

### Tailwind Utility Classes

**Design system:**
```typescript
// Color palette
bg-slate-950          // Base background
bg-slate-900          // Card background
text-slate-100        // Primary text
text-slate-400        // Secondary text
border-slate-800      // Borders

// Brand colors (blue)
bg-brand-500          // Primary brand
text-brand-400        // Links
border-brand-400      // Focused states

// Status colors
text-green-400        // COMPLIANT
text-yellow-400       // MISSING
text-orange-400       // EXPIRED
text-red-400          // OVER_LIMIT
```

### Custom Utilities (globals.css)

```css
.card {
  @apply rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-card backdrop-blur;
}

.section-title {
  @apply text-lg font-semibold text-white;
}
```

### Component Styling Pattern

```typescript
<div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-card backdrop-blur">
  <h2 className="text-lg font-semibold text-white mb-4">Title</h2>
  <p className="text-sm text-slate-400">Description</p>
</div>
```

**Or use SectionCard wrapper:**
```typescript
<SectionCard title="Title" description="Description">
  <Content />
</SectionCard>
```

### Conditional Classes

```typescript
import clsx from 'clsx';

<button className={clsx(
  "rounded-lg px-4 py-2",
  loading ? "bg-slate-700 cursor-not-allowed" : "bg-brand-500 hover:bg-brand-600"
)}>
  {loading ? 'Loading...' : 'Submit'}
</button>
```

## Common Component Patterns

### 1. Data Table with Virtual Scrolling

```typescript
import { useReactTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

const table = useReactTable({
  data: filteredData,
  columns,
  state: { sorting },
  onSortingChange: setSorting,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel()
});

const rowVirtualizer = useVirtualizer({
  getScrollElement: () => parentRef.current,
  count: table.getRowModel().rows.length,
  estimateSize: () => 64,
  overscan: 12
});
```

**Key features:**
- Virtual scrolling for 1000+ rows
- Sortable columns
- Filter support
- Sticky headers (`position: sticky; top: 0`)

**Reference:** `components/dashboard/bom-explorer.tsx`

### 2. Form with File Upload

```typescript
"use client";
import { useState, type FormEvent } from 'react';

export default function FileUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error);
      }

      const result = await response.json();
      console.log('Success:', result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        disabled={loading}
      />
      <button type="submit" disabled={!file || loading}>
        {loading ? 'Uploading...' : 'Upload'}
      </button>
      {error && <div className="text-red-400">{error}</div>}
    </form>
  );
}
```

**Reference:** `components/compliance/bom-uploader.tsx`, `components/documents/document-uploader.tsx`

### 3. Debounced API Calls

```typescript
"use client";
import { useState, useEffect, useTransition } from 'react';

export default function ImpactSimulator() {
  const [limit, setLimit] = useState(100);
  const [scenario, setScenario] = useState(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          const response = await fetch('/api/impact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit }),
            signal: controller.signal
          });
          const data = await response.json();
          setScenario(data);
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error(err);
          }
        }
      });
    }, 450); // Debounce delay

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [limit]);

  return (
    <div>
      <input
        type="range"
        value={limit}
        onChange={(e) => setLimit(Number(e.target.value))}
      />
      {isPending && <div>Calculating...</div>}
      {scenario && <Results data={scenario} />}
    </div>
  );
}
```

**Reference:** `components/dashboard/impact-simulator.tsx`

### 4. Chart Visualization (Recharts)

```typescript
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#f87171'];

<ResponsiveContainer width="100%" height={300}>
  <PieChart>
    <Pie
      data={data}
      cx="50%"
      cy="50%"
      innerRadius={60}
      outerRadius={80}
      dataKey="value"
    >
      {data.map((entry, index) => (
        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
      ))}
    </Pie>
    <Legend />
  </PieChart>
</ResponsiveContainer>
```

**Reference:** `components/dashboard/risk-visualization.tsx`

### 5. Optimistic UI Updates

```typescript
const [messages, setMessages] = useState<ChatMessage[]>([]);

const handleSend = async (userMessage: string) => {
  // Optimistically add user message
  const newMessage = { role: 'user', content: userMessage };
  setMessages([...messages, newMessage]);

  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [...messages, newMessage] })
    });
    const assistantMessage = await response.json();

    // Add assistant response
    setMessages([...messages, newMessage, assistantMessage]);
  } catch (error) {
    // Rollback on error
    setMessages(messages);
    setError('Failed to send message');
  }
};
```

**Reference:** `components/cora/cora-chat-panel.tsx`

## API Client Usage

### Core Client (lib/api/client.ts)

```typescript
import { certivoApiFetch } from '@/lib/api/client';

// Type-safe fetch
const snapshot = await certivoApiFetch<DashboardSnapshot>('/dashboard/snapshot');

// With options
const result = await certivoApiFetch<UploadResult>('/compliance/bom', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
```

**Features:**
- Automatic JWT token injection (Authorization header)
- Base URL resolution from `CERTIVO_API_URL`
- Type-safe responses
- Error handling with message extraction

### Environment Variables

```typescript
// lib/env.ts
export const CERTIVO_API_URL = process.env.CERTIVO_API_URL;
export const CERTIVO_API_TOKEN = process.env.CERTIVO_API_TOKEN;

// JWT utilities
export function getTenantIdFromToken(): string;
export function getUserIdFromToken(): string;
```

**Required environment variables:**
- `CERTIVO_API_URL` - Backend API base URL (e.g., http://localhost:4000)
- `CERTIVO_API_TOKEN` - JWT token from generate-dev-token.mjs

## Page Structure Template

```typescript
// app/my-page/page.tsx
import { SectionCard } from '@/components/ui/section-card';
import { MyClientComponent } from '@/components/my-domain/my-client-component';
import { fetchMyData } from '@/lib/api/my-api';

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const data = await fetchMyData();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 shadow">
        <div className="px-8 py-6">
          <h1 className="text-3xl font-bold text-white">My Page</h1>
          <p className="text-brand-100 mt-2">Description</p>
        </div>
        <nav className="border-t border-brand-500/20 px-8">
          <div className="flex space-x-1 py-3">
            <NavLink href="/" label="Dashboard" />
            <NavLink href="/my-page" label="My Page" active />
          </div>
        </nav>
      </div>

      {/* Content */}
      <div className="px-8 py-6 space-y-6">
        <SectionCard title="Section Title" description="Section description">
          <MyClientComponent data={data} />
        </SectionCard>
      </div>
    </div>
  );
}
```

## Adding a New Feature (Step-by-Step)

### 1. Add API Route (if needed)

```typescript
// app/api/my-feature/route.ts
import { NextResponse } from 'next/server';
import { certivoApiFetch } from '@/lib/api/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await certivoApiFetch<MyResult>('/my-backend-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

### 2. Create API Client Helper (optional)

```typescript
// lib/api/my-feature.ts
import { certivoApiFetch } from './client';
import type { MyFeatureDto } from '@certivo/my-module';

export type MyFeature = MyFeatureDto;

export async function fetchMyFeature(id: string): Promise<MyFeature> {
  return certivoApiFetch<MyFeature>(`/my-feature/${id}`);
}
```

### 3. Create Client Component

```typescript
// components/my-domain/my-component.tsx
"use client";
import { useState } from 'react';
import { SectionCard } from '@/components/ui/section-card';

type MyComponentProps = {
  data: MyData;
  onUpdate?: (id: string) => void;
};

export function MyComponent({ data, onUpdate }: MyComponentProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/my-feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.id })
      });
      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error);
      }
      const result = await response.json();
      onUpdate?.(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionCard title="My Component" description="Component description">
      <button
        onClick={handleAction}
        disabled={loading}
        className="rounded-lg bg-brand-500 px-4 py-2 text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {loading ? 'Processing...' : 'Take Action'}
      </button>
      {error && (
        <div className="mt-4 rounded-md bg-red-900/20 border border-red-800 p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}
    </SectionCard>
  );
}
```

### 4. Add Page (if needed)

```typescript
// app/my-page/page.tsx
import { MyComponent } from '@/components/my-domain/my-component';
import { fetchMyFeature } from '@/lib/api/my-feature';

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const data = await fetchMyFeature('default');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="px-8 py-6">
        <MyComponent data={data} />
      </div>
    </div>
  );
}
```

### 5. Add Navigation Link

```typescript
// app/page.tsx or layout
<Link
  href="/my-page"
  className="rounded-lg px-4 py-2 text-brand-100 hover:bg-brand-600/20"
>
  My Page
</Link>
```

## Performance Optimization Patterns

### 1. Memoization

```typescript
import { useMemo } from 'react';

const filteredData = useMemo(() => {
  return rows.filter(row =>
    row.status === statusFilter &&
    row.partNumber.includes(search)
  );
}, [rows, statusFilter, search]);
```

### 2. Virtual Scrolling (Large Lists)

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 64,
  overscan: 12
});
```

### 3. Debouncing

```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    // API call
  }, 450);
  return () => clearTimeout(timer);
}, [dependency]);
```

### 4. Request Cancellation

```typescript
useEffect(() => {
  const controller = new AbortController();

  fetch(url, { signal: controller.signal })
    .then(handleResponse)
    .catch(handleError);

  return () => controller.abort();
}, [url]);
```

## Error Handling Best Practices

### Component-Level Error State

```typescript
const [error, setError] = useState<string | null>(null);

try {
  // API call
  setError(null);
} catch (err) {
  setError(err instanceof Error ? err.message : 'Operation failed');
}

// Display
{error && (
  <div className="rounded-md bg-red-900/20 border border-red-800 p-4">
    <p className="text-sm text-red-300">{error}</p>
  </div>
)}
```

### API Route Error Handling

```typescript
try {
  const data = await certivoApiFetch(...);
  return NextResponse.json(data);
} catch (error) {
  const message = error instanceof Error ? error.message : 'API request failed';
  return NextResponse.json({ error: message }, { status: 500 });
}
```

## Testing Strategy

**Current state:** No tests implemented (`test` script is a placeholder)

**Recommended approach:**
1. **Unit tests:** Utilities and pure functions (Jest + React Testing Library)
2. **Component tests:** Interactive components (React Testing Library)
3. **Integration tests:** API routes (Supertest or similar)
4. **E2E tests:** Critical user flows (Playwright)

## Common Pitfalls & Solutions

### Pitfall 1: Using Client Component for Static Content
❌ **Wrong:**
```typescript
"use client";
export default function StaticPage() {
  return <div>Static content</div>;
}
```

✅ **Correct:**
```typescript
// Remove "use client" - it's a Server Component by default
export default function StaticPage() {
  return <div>Static content</div>;
}
```

### Pitfall 2: Fetching Data in Client Component on Mount
❌ **Wrong:**
```typescript
"use client";
export default function MyComponent() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/data').then(res => res.json()).then(setData);
  }, []);

  return <div>{data?.value}</div>;
}
```

✅ **Correct:** Fetch in Server Component, pass as props
```typescript
// page.tsx (Server Component)
export default async function MyPage() {
  const data = await fetchData();
  return <MyComponent data={data} />;
}

// component.tsx (Client Component)
"use client";
export function MyComponent({ data }: { data: Data }) {
  return <div>{data.value}</div>;
}
```

### Pitfall 3: Not Cleaning Up Effects
❌ **Wrong:**
```typescript
useEffect(() => {
  const timer = setTimeout(() => fetchData(), 500);
}, [query]);
```

✅ **Correct:**
```typescript
useEffect(() => {
  const timer = setTimeout(() => fetchData(), 500);
  return () => clearTimeout(timer);
}, [query]);
```

### Pitfall 4: Hardcoding URLs
❌ **Wrong:**
```typescript
const response = await fetch('http://localhost:4000/api/data');
```

✅ **Correct:**
```typescript
const response = await fetch('/api/data'); // Use Next.js API route
// OR
const data = await certivoApiFetch('/data'); // Use API client
```

## Key Files Reference

### Configuration
- `next.config.mjs` - Next.js configuration
- `tailwind.config.ts` - Tailwind theme customization
- `tsconfig.json` - TypeScript configuration with path aliases
- `package.json` - Dependencies and scripts

### Core Files
- `app/layout.tsx` - Root layout with dark theme
- `app/providers.tsx` - Global context providers (role management)
- `app/globals.css` - Global styles and Tailwind utilities
- `lib/api/client.ts` - API client with JWT authentication
- `lib/env.ts` - Environment variable access and JWT utilities
- `lib/types/dashboard.ts` - Type definitions from backend DTOs

### Key Components
- `components/ui/section-card.tsx` - Base card wrapper
- `components/dashboard/bom-explorer.tsx` - Virtualized table example
- `components/dashboard/impact-simulator.tsx` - Debounced API calls example
- `components/cora/cora-chat-panel.tsx` - Optimistic updates example
- `components/rbac/role-gate.tsx` - Role-based access control
- `components/compliance/bom-uploader.tsx` - File upload example

## Development Workflow Tips

1. **Start with the type definitions** - Import from backend modules
2. **Create the API route** if backend integration needed
3. **Build the client component** with proper state management
4. **Test manually** - no automated tests yet
5. **Follow existing patterns** - consistency over cleverness
6. **Use SectionCard** for consistent UI
7. **Check responsive design** on different screen sizes
8. **Verify role-based access** if adding restricted features

## Design System Quick Reference

### Spacing
- `p-4` (16px), `p-6` (24px) - Card padding
- `space-y-4` (16px), `space-y-6` (24px) - Vertical spacing
- `gap-4` (16px), `gap-6` (24px) - Grid/flex gaps

### Border Radius
- `rounded-lg` (8px) - Buttons, inputs
- `rounded-xl` (12px) - Cards, panels
- `rounded-2xl` (16px) - Major sections

### Typography
- `text-3xl font-bold` - Page titles
- `text-lg font-semibold` - Section titles
- `text-sm` - Body text, labels
- `text-xs` - Captions, metadata

### Colors (Status)
- Green: COMPLIANT, success states
- Yellow: MISSING, warnings
- Orange: EXPIRED, moderate issues
- Red: OVER_LIMIT, errors

## Future Considerations

### When to Add Libraries

**Consider React Query/SWR when:**
- Need automatic background refetching
- Want optimistic updates with rollback
- Multiple components need same data

**Consider React Hook Form when:**
- Forms become complex (5+ fields)
- Need field-level validation
- Want better performance

**Consider Error Boundaries when:**
- Need graceful degradation
- Want to prevent entire app crashes
- Need error telemetry

**Consider shadcn/ui when:**
- Need more complex UI primitives (dropdowns, modals, etc.)
- Want consistent component APIs
- Team grows and needs shared components

## Architecture Alignment

This frontend follows the modular monolith philosophy:
- **Clear boundaries** via component folders by domain
- **Dependency injection** via props (no prop drilling issues yet)
- **BFF pattern** allows backend evolution without frontend changes
- **Type sharing** from backend ensures consistency
- **Future extraction seams** - each domain folder could become a micro-frontend

## Getting Help

**When stuck:**
1. Check existing similar components for patterns
2. Review the API route to understand data flow
3. Check backend DTO types for available data
4. Look at Architecture.md for system design context
5. Verify environment variables are set correctly

**Common issues:**
- "API token invalid" → Regenerate token with generate-dev-token.mjs
- "API not responding" → Ensure backend is running on port 4000
- "Type errors" → Check if backend module types were updated
- "Styles not applying" → Check if using correct Tailwind classes
