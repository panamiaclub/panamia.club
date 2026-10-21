'use client';

import {
  Archive,
  Bell,
  Box,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ImagePlus,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAdminGate } from '@/components/Admin/gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSession } from '@/lib/auth-client';

type Tab = 'products' | 'orders' | 'subscriptions' | 'settings';
type ProductKind = 'merchandise' | 'subscription';

interface Product {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  visible: boolean;
  slug: string;
  kind: ProductKind;
  price: {
    id: string;
    unitAmount: number;
    currency: string;
    type: string;
    recurringInterval: 'month' | 'year' | null;
  };
  availableQuantity: number | null;
  reservedQuantity: number;
  trackInventory: boolean;
}

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
}

interface Order {
  id: string;
  createdAt: string;
  kind: 'merchandise' | 'subscription';
  status: string;
  fulfillmentStatus: string;
  email: string | null;
  customerName: string | null;
  totalCents: number;
  refundedCents: number;
  shippingAddress: Record<string, string | null> | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  items: OrderItem[];
}

interface Subscription {
  id: string;
  email: string;
  status: string;
  stripePriceId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

interface ShopSettings {
  standardShippingEnabled: boolean;
  standardShippingCents: number;
  standardShippingMinDays: number;
  standardShippingMaxDays: number;
  localPickupEnabled: boolean;
  pickupInstructions: string | null;
  ghlSyncEnabled: boolean;
  customerEmailEnabled: boolean;
  staffEmailEnabled: boolean;
}

interface ShopData {
  products: Product[];
  orders: Order[];
  subscriptions: Subscription[];
  settings: ShopSettings;
  stats: {
    revenueCents: number;
    completedOrders: number;
    availableItems: number;
    activeProducts: number;
    needsFulfillment: number;
    activeSubscriptions: number;
  };
}

interface ProductDraft {
  productId?: string;
  currentPriceId?: string;
  name: string;
  description: string;
  slug: string;
  kind: ProductKind;
  price: string;
  recurringInterval: 'month' | 'year';
  visible: boolean;
  trackInventory: boolean;
  availableQuantity: string;
  images: string[];
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  description: '',
  slug: '',
  kind: 'merchandise',
  price: '',
  recurringInterval: 'month',
  visible: true,
  trackInventory: true,
  availableQuantity: '0',
  images: [],
};

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function draftFromProduct(product: Product): ProductDraft {
  return {
    productId: product.id,
    currentPriceId: product.price.id,
    name: product.name,
    description: product.description ?? '',
    slug: product.slug,
    kind: product.kind,
    price: (product.price.unitAmount / 100).toFixed(2),
    recurringInterval: product.price.recurringInterval ?? 'month',
    visible: product.visible,
    trackInventory: product.trackInventory,
    availableQuantity: String(product.availableQuantity ?? 0),
    images: product.images,
  };
}

export default function AdminShopPage() {
  const { data: session } = useSession();
  const { gate } = useAdminGate();
  const [data, setData] = useState<ShopData | null>(null);
  const [tab, setTab] = useState<Tab>('products');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [notice, setNotice] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const toast = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/admin/shop');
    const result = (await response.json()) as ShopData & { error?: string };
    if (!response.ok) {
      toast(result.error || 'Could not load shop operations.');
      setLoading(false);
      return;
    }
    setData(result);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (session?.user) void load();
  }, [load, session?.user]);

  const products = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.products ?? []).filter((product) => {
      if (visibility === 'visible' && !product.visible) return false;
      if (visibility === 'hidden' && product.visible) return false;
      return (
        !normalized ||
        product.name.toLowerCase().includes(normalized) ||
        product.description?.toLowerCase().includes(normalized)
      );
    });
  }, [data?.products, query, visibility]);

  function openCreate(kind: ProductKind = 'merchandise') {
    setDraft({ ...EMPTY_DRAFT, kind });
    setDrawerOpen(true);
  }

  function openEdit(product: Product) {
    setDraft(draftFromProduct(product));
    setDrawerOpen(true);
  }

  async function uploadImage(file: File) {
    setBusy(true);
    const formData = new FormData();
    formData.set('file', file);
    const response = await fetch('/api/admin/shop/media', {
      method: 'POST',
      body: formData,
    });
    const result = (await response.json()) as { url?: string; error?: string };
    setBusy(false);
    if (!response.ok || !result.url) {
      toast(result.error || 'Image upload failed.');
      return;
    }
    setDraft((current) => ({
      ...current,
      images: [...current.images, result.url!].slice(0, 8),
    }));
  }

  async function saveProduct() {
    const price = Number(draft.price);
    if (!draft.name.trim() || !Number.isFinite(price) || price < 0) {
      toast('Add a product name and valid price.');
      return;
    }
    setBusy(true);
    const response = await fetch('/api/admin/shop/products', {
      method: draft.productId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: draft.productId,
        currentPriceId: draft.currentPriceId,
        name: draft.name,
        description: draft.description,
        slug: draft.slug || slugify(draft.name),
        kind: draft.kind,
        priceCents: Math.round(price * 100),
        recurringInterval: draft.recurringInterval,
        visible: draft.visible,
        trackInventory: draft.trackInventory,
        availableQuantity: Number(draft.availableQuantity),
        images: draft.images,
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      toast(result.error || 'Product save failed.');
      return;
    }
    setDrawerOpen(false);
    toast(`${draft.name} saved.`);
    await load();
  }

  async function archiveProduct() {
    if (!draft.productId) return;
    if (
      !window.confirm(`Archive ${draft.name}? Existing orders stay intact.`)
    ) {
      return;
    }
    setBusy(true);
    const response = await fetch('/api/admin/shop/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: draft.productId,
        priceId: draft.currentPriceId,
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      toast(result.error || 'Archive failed.');
      return;
    }
    setDrawerOpen(false);
    toast(`${draft.name} archived.`);
    await load();
  }

  async function syncStripe() {
    setBusy(true);
    const response = await fetch('/api/admin/shop', { method: 'POST' });
    const result = (await response.json()) as {
      synced?: number;
      error?: string;
    };
    setBusy(false);
    toast(
      response.ok
        ? `Synchronized ${result.synced ?? 0} Stripe prices.`
        : result.error || 'Sync failed.'
    );
    if (response.ok) await load();
  }

  if (gate) return gate;

  return (
    <div className="relative">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-pana-burnt-deep text-xs font-black tracking-[0.17em] uppercase">
            Commerce
          </p>
          <h1 className="mt-1 text-4xl font-black tracking-tight md:text-5xl">
            Shop operations
          </h1>
          <p className="text-pana-ink/65 mt-3 max-w-2xl">
            Products, photos, prices, stock, orders, subscriptions and
            fulfillment—managed here while Stripe handles money.
          </p>
        </div>
        <Button
          onClick={() => openCreate()}
          className="bg-pana-ink text-pana-cream"
        >
          <Plus /> Add product
        </Button>
      </div>

      <Stats data={data} loading={loading} />

      <div className="border-pana-ink/10 mt-7 flex gap-2 overflow-x-auto border-b pb-2">
        <TabButton
          active={tab === 'products'}
          onClick={() => setTab('products')}
          icon={<Store />}
          label="Products"
        />
        <TabButton
          active={tab === 'orders'}
          onClick={() => setTab('orders')}
          icon={<ShoppingBag />}
          label="Orders"
          count={data?.stats.needsFulfillment}
        />
        <TabButton
          active={tab === 'subscriptions'}
          onClick={() => setTab('subscriptions')}
          icon={<RotateCcw />}
          label="Subscriptions"
        />
        <TabButton
          active={tab === 'settings'}
          onClick={() => setTab('settings')}
          icon={<Settings />}
          label="Settings"
        />
      </div>

      {tab === 'products' && (
        <ProductsPanel
          products={products}
          query={query}
          visibility={visibility}
          busy={busy}
          setQuery={setQuery}
          setVisibility={setVisibility}
          syncStripe={syncStripe}
          openEdit={openEdit}
        />
      )}
      {tab === 'orders' && data && (
        <OrdersPanel
          orders={data.orders}
          expandedOrder={expandedOrder}
          setExpandedOrder={setExpandedOrder}
          reload={load}
          toast={toast}
        />
      )}
      {tab === 'subscriptions' && data && (
        <SubscriptionsPanel
          products={data.products.filter(
            (product) => product.kind === 'subscription'
          )}
          subscriptions={data.subscriptions}
          openCreate={() => openCreate('subscription')}
          openEdit={openEdit}
        />
      )}
      {tab === 'settings' && data && (
        <SettingsPanel initial={data.settings} reload={load} toast={toast} />
      )}

      <ProductDrawer
        open={drawerOpen}
        draft={draft}
        busy={busy}
        setDraft={setDraft}
        close={() => setDrawerOpen(false)}
        uploadImage={uploadImage}
        saveProduct={saveProduct}
        archiveProduct={archiveProduct}
      />

      {notice && (
        <div
          role="status"
          className="bg-pana-butter text-pana-ink border-pana-ink fixed right-5 bottom-5 z-[80] rounded-xl border-2 px-5 py-3 font-black shadow-[6px_6px_0_#110d0d]"
        >
          {notice}
        </div>
      )}
    </div>
  );
}

function Stats({ data, loading }: { data: ShopData | null; loading: boolean }) {
  const stats = data?.stats;
  const cards = [
    {
      label: 'Revenue this month',
      value: loading ? '…' : money(stats?.revenueCents ?? 0),
      detail: `${stats?.completedOrders ?? 0} completed orders`,
      className: 'bg-pana-butter-2',
    },
    {
      label: 'Items available',
      value: loading ? '…' : String(stats?.availableItems ?? 0),
      detail: `${stats?.activeProducts ?? 0} active products`,
      className: 'bg-[#e0f4fd]',
    },
    {
      label: 'Needs fulfillment',
      value: loading ? '…' : String(stats?.needsFulfillment ?? 0),
      detail:
        (stats?.needsFulfillment ?? 0) > 0
          ? 'Orders waiting on staff'
          : 'Nothing waiting',
      className: 'bg-[#ffdfcf]',
    },
    {
      label: 'Active subscriptions',
      value: loading ? '…' : String(stats?.activeSubscriptions ?? 0),
      detail: 'Stripe-backed memberships',
      className: 'bg-[#eeeafa]',
    },
  ];
  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.label}
          className={`${card.className} border-pana-ink/10 min-h-32 rounded-2xl border p-5`}
        >
          <p className="text-pana-ink/60 text-xs font-black tracking-widest uppercase">
            {card.label}
          </p>
          <p className="mt-3 text-3xl font-black">{card.value}</p>
          <p className="text-pana-ink/60 mt-1 text-xs">{card.detail}</p>
        </article>
      ))}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-black',
        active
          ? 'bg-pana-blue text-pana-ink'
          : 'text-pana-ink/65 hover:bg-pana-ink/5',
      ].join(' ')}
    >
      <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      {label}
      {!!count && (
        <span className="bg-pana-pink grid min-h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] text-white">
          {count}
        </span>
      )}
    </button>
  );
}

function ProductsPanel({
  products,
  query,
  visibility,
  busy,
  setQuery,
  setVisibility,
  syncStripe,
  openEdit,
}: {
  products: Product[];
  query: string;
  visibility: string;
  busy: boolean;
  setQuery: (value: string) => void;
  setVisibility: (value: string) => void;
  syncStripe: () => Promise<void>;
  openEdit: (product: Product) => void;
}) {
  return (
    <section>
      <div className="border-pana-ink/10 mt-5 flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3">
        <label className="bg-pana-cream border-pana-ink/10 flex min-w-64 flex-1 items-center gap-2 rounded-lg border px-3">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products…"
            className="h-10 w-full bg-transparent outline-none"
          />
        </label>
        <select
          value={visibility}
          onChange={(event) => setVisibility(event.target.value)}
          className="border-pana-ink/10 h-10 rounded-lg border bg-white px-3 font-bold"
        >
          <option value="all">All products</option>
          <option value="visible">Visible</option>
          <option value="hidden">Hidden</option>
        </select>
        <Button variant="outline" onClick={syncStripe} disabled={busy}>
          <RefreshCw /> Sync Stripe
        </Button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <article
            key={product.id}
            className="border-pana-ink/10 overflow-hidden rounded-2xl border bg-white"
          >
            <div
              className={[
                'relative flex h-44 items-center justify-center overflow-hidden',
                product.images[0]
                  ? 'bg-zinc-100'
                  : product.kind === 'subscription'
                    ? 'bg-pana-indigo'
                    : 'bg-pana-butter-2',
              ].join(' ')}
            >
              {product.images[0] ? (
                <img
                  src={product.images[0]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Box
                  className={
                    product.kind === 'subscription'
                      ? 'text-pana-butter h-16 w-16'
                      : 'text-pana-ink/30 h-16 w-16'
                  }
                />
              )}
              <span className="absolute top-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-black">
                {product.images.length
                  ? `${product.images.length} photo${product.images.length === 1 ? '' : 's'}`
                  : 'Add photos'}
              </span>
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-black">{product.name}</h2>
                <span
                  className={[
                    'rounded-full px-2 py-1 text-[10px] font-black uppercase',
                    product.visible
                      ? 'bg-green-100 text-green-800'
                      : 'bg-zinc-100 text-zinc-600',
                  ].join(' ')}
                >
                  {product.visible ? 'Visible' : 'Hidden'}
                </span>
              </div>
              <p className="text-pana-ink/60 mt-2 line-clamp-2 min-h-10 text-sm">
                {product.description || 'No description yet.'}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Meta label="Price" value={money(product.price.unitAmount)} />
                <Meta
                  label="Stock"
                  value={
                    product.kind === 'subscription'
                      ? '—'
                      : String(product.availableQuantity ?? 0)
                  }
                />
                <Meta
                  label="Reserved"
                  value={
                    product.kind === 'subscription'
                      ? '—'
                      : String(product.reservedQuantity)
                  }
                />
              </div>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => openEdit(product)}
              >
                Edit product
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f8f5f0] p-2.5">
      <span className="text-pana-ink/55 block text-[10px] font-black uppercase">
        {label}
      </span>
      <strong className="mt-0.5 block">{value}</strong>
    </div>
  );
}

function OrdersPanel({
  orders,
  expandedOrder,
  setExpandedOrder,
  reload,
  toast,
}: {
  orders: Order[];
  expandedOrder: string | null;
  setExpandedOrder: (id: string | null) => void;
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  return (
    <section className="mt-5 space-y-3">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          expanded={expandedOrder === order.id}
          toggle={() =>
            setExpandedOrder(expandedOrder === order.id ? null : order.id)
          }
          reload={reload}
          toast={toast}
        />
      ))}
      {orders.length === 0 && (
        <div className="border-pana-ink/10 rounded-2xl border-2 border-dashed p-12 text-center">
          No orders yet.
        </div>
      )}
    </section>
  );
}

function OrderCard({
  order,
  expanded,
  toggle,
  reload,
  toast,
}: {
  order: Order;
  expanded: boolean;
  toggle: () => void;
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [fulfillment, setFulfillment] = useState(order.fulfillmentStatus);
  const [trackingNumber, setTrackingNumber] = useState(
    order.trackingNumber ?? ''
  );
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl ?? '');
  const [refundAmount, setRefundAmount] = useState(
    ((order.totalCents - order.refundedCents) / 100).toFixed(2)
  );
  const [refundReason, setRefundReason] = useState('');

  async function saveFulfillment() {
    const response = await fetch('/api/admin/shop', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'order',
        orderId: order.id,
        fulfillmentStatus: fulfillment,
        trackingNumber,
        trackingUrl,
      }),
    });
    const result = (await response.json()) as { error?: string };
    toast(response.ok ? 'Fulfillment saved.' : result.error || 'Save failed.');
    if (response.ok) await reload();
  }

  async function refund() {
    if (!refundReason.trim()) {
      toast('Write a reason before issuing the refund.');
      return;
    }
    if (
      !window.confirm(
        `Refund ${money(Math.round(Number(refundAmount) * 100))} for this order?`
      )
    ) {
      return;
    }
    const response = await fetch('/api/admin/shop/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        amountCents: Math.round(Number(refundAmount) * 100),
        reason: refundReason,
      }),
    });
    const result = (await response.json()) as { error?: string };
    toast(
      response.ok
        ? 'Refund submitted to Stripe.'
        : result.error || 'Refund failed.'
    );
    if (response.ok) await reload();
  }

  return (
    <article className="border-pana-ink/10 rounded-2xl border bg-white p-5">
      <button
        type="button"
        onClick={toggle}
        className="grid w-full gap-4 text-left md:grid-cols-[1.1fr_1.4fr_1fr_0.8fr_auto] md:items-center"
      >
        <div>
          <p className="font-black">
            {order.customerName || order.email || 'Customer'}
          </p>
          <p className="text-pana-ink/55 text-xs">
            {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="text-sm">
          {order.items.map((item) => (
            <p key={item.id}>
              {item.productName} × {item.quantity}
            </p>
          ))}
        </div>
        <div className="text-sm capitalize">
          <span className="font-black">
            {order.status.replaceAll('_', ' ')}
          </span>
          <p className="text-pana-ink/55">
            {order.fulfillmentStatus.replaceAll('_', ' ')}
          </p>
        </div>
        <p className="font-black">{money(order.totalCents)}</p>
        <span>{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="border-pana-ink/10 mt-5 grid gap-5 border-t pt-5 xl:grid-cols-2">
          <div>
            <h3 className="font-black">Fulfillment</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select
                value={fulfillment}
                onChange={(event) => setFulfillment(event.target.value)}
                className="border-pana-ink/10 h-10 rounded-lg border px-3"
              >
                <option value="unfulfilled">Unfulfilled</option>
                <option value="processing">Processing</option>
                <option value="fulfilled">Fulfilled</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <Input
                value={trackingNumber}
                onChange={(event) => setTrackingNumber(event.target.value)}
                placeholder="Tracking number"
              />
              <Input
                value={trackingUrl}
                onChange={(event) => setTrackingUrl(event.target.value)}
                placeholder="Tracking URL"
                className="sm:col-span-2"
              />
              <Button onClick={saveFulfillment} className="sm:col-span-2">
                <PackageCheck /> Save fulfillment
              </Button>
            </div>
          </div>
          <div>
            <h3 className="font-black">Refund</h3>
            <p className="text-pana-ink/55 mt-1 text-xs">
              Remaining refundable:{' '}
              {money(order.totalCents - order.refundedCents)}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr]">
              <Input
                type="number"
                step="0.01"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
              <Input
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                placeholder="Reason recorded with refund"
              />
              <Button
                variant="destructive"
                className="sm:col-span-2"
                disabled={order.refundedCents >= order.totalCents}
                onClick={refund}
              >
                <CreditCard /> Issue refund
              </Button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function SubscriptionsPanel({
  products,
  subscriptions,
  openCreate,
  openEdit,
}: {
  products: Product[];
  subscriptions: Subscription[];
  openCreate: () => void;
  openEdit: (product: Product) => void;
}) {
  return (
    <section className="mt-5">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus /> Create plan
        </Button>
      </div>
      {products.length === 0 ? (
        <div className="border-pana-ink/10 mt-4 rounded-2xl border-2 border-dashed p-12 text-center">
          <RotateCcw className="mx-auto h-11 w-11" />
          <h2 className="mt-3 text-2xl font-black">No subscription plans</h2>
          <p className="text-pana-ink/60 mx-auto mt-2 max-w-lg">
            Create monthly or annual memberships here when subscriptions are
            ready for the shop.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="border-pana-ink/10 rounded-2xl border bg-white p-5"
            >
              <span className="text-pana-burnt-deep text-xs font-black uppercase">
                {product.visible ? 'Published' : 'Hidden'}
              </span>
              <h2 className="mt-1 text-xl font-black">{product.name}</h2>
              <p className="mt-2 text-2xl font-black">
                {money(product.price.unitAmount)} /{' '}
                {product.price.recurringInterval}
              </p>
              <p className="text-pana-ink/60 mt-2 text-sm">
                {
                  subscriptions.filter(
                    (subscription) =>
                      subscription.stripePriceId === product.price.id &&
                      ['active', 'trialing'].includes(subscription.status)
                  ).length
                }{' '}
                active subscribers
              </p>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => openEdit(product)}
              >
                Edit plan
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SettingsPanel({
  initial,
  reload,
  toast,
}: {
  initial: ShopSettings;
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const response = await fetch('/api/admin/shop', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'settings', settings }),
    });
    const result = (await response.json()) as { error?: string };
    setSaving(false);
    toast(
      response.ok ? 'Store settings saved.' : result.error || 'Save failed.'
    );
    if (response.ok) await reload();
  }

  const toggle = (key: keyof ShopSettings) =>
    setSettings((current) => ({
      ...current,
      [key]: !current[key],
    }));

  return (
    <section className="mt-5 grid gap-4 xl:grid-cols-2">
      <SettingCard title="Shipping & pickup" icon={<ShoppingBag />}>
        <Toggle
          label="Standard shipping"
          detail="Offer delivery during checkout"
          checked={settings.standardShippingEnabled}
          onClick={() => toggle('standardShippingEnabled')}
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Field label="Price">
            <Input
              type="number"
              step="0.01"
              value={(settings.standardShippingCents / 100).toFixed(2)}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  standardShippingCents: Math.round(
                    Number(event.target.value) * 100
                  ),
                }))
              }
            />
          </Field>
          <Field label="Min days">
            <Input
              type="number"
              value={settings.standardShippingMinDays}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  standardShippingMinDays: Number(event.target.value),
                }))
              }
            />
          </Field>
          <Field label="Max days">
            <Input
              type="number"
              value={settings.standardShippingMaxDays}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  standardShippingMaxDays: Number(event.target.value),
                }))
              }
            />
          </Field>
        </div>
        <Toggle
          label="Local pickup"
          detail="Offer a free pickup option"
          checked={settings.localPickupEnabled}
          onClick={() => toggle('localPickupEnabled')}
        />
        <Field label="Pickup instructions">
          <Input
            value={settings.pickupInstructions ?? ''}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                pickupInstructions: event.target.value,
              }))
            }
            placeholder="Sent to the customer after purchase"
          />
        </Field>
      </SettingCard>
      <SettingCard title="Automation" icon={<Bell />}>
        <Toggle
          label="HighLevel buyer sync"
          detail="Tag successful customers in the CRM"
          checked={settings.ghlSyncEnabled}
          onClick={() => toggle('ghlSyncEnabled')}
        />
        <Toggle
          label="Customer confirmations"
          detail="Email receipts and fulfillment context"
          checked={settings.customerEmailEnabled}
          onClick={() => toggle('customerEmailEnabled')}
        />
        <Toggle
          label="Staff order notifications"
          detail="Email the configured admin addresses"
          checked={settings.staffEmailEnabled}
          onClick={() => toggle('staffEmailEnabled')}
        />
      </SettingCard>
      <div className="flex justify-end xl:col-span-2">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save store settings'}
        </Button>
      </div>
    </section>
  );
}

function SettingCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="border-pana-ink/10 rounded-2xl border bg-white p-5">
      <h2 className="flex items-center gap-2 text-xl font-black">
        <span className="[&_svg]:h-5 [&_svg]:w-5">{icon}</span>
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </article>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onClick,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <div className="border-pana-ink/10 flex items-center justify-between gap-4 border-b pb-4">
      <div>
        <p className="font-black">{label}</p>
        <p className="text-pana-ink/55 text-xs">{detail}</p>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={onClick}
        className={[
          'h-7 w-12 rounded-full p-1 transition-colors',
          checked ? 'bg-pana-indigo' : 'bg-zinc-300',
        ].join(' ')}
      >
        <span
          className={[
            'block h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black">{label}</span>
      {children}
    </label>
  );
}

function ProductDrawer({
  open,
  draft,
  busy,
  setDraft,
  close,
  uploadImage,
  saveProduct,
  archiveProduct,
}: {
  open: boolean;
  draft: ProductDraft;
  busy: boolean;
  setDraft: React.Dispatch<React.SetStateAction<ProductDraft>>;
  close: () => void;
  uploadImage: (file: File) => Promise<void>;
  saveProduct: () => Promise<void>;
  archiveProduct: () => Promise<void>;
}) {
  function moveImage(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const next = [...current.images];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, images: next };
    });
  }

  return (
    <div
      className={[
        'bg-pana-ink/40 fixed inset-0 z-[70] transition-opacity',
        open
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0',
      ].join(' ')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        className={[
          'bg-pana-cream absolute top-0 right-0 h-full w-full max-w-2xl overflow-y-auto p-6 shadow-2xl transition-transform md:p-8',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-pana-burnt-deep text-xs font-black tracking-widest uppercase">
              Product editor
            </p>
            <h2 className="mt-1 text-3xl font-black">
              {draft.productId ? 'Edit product' : 'Add product'}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="border-pana-ink/10 grid h-10 w-10 place-items-center rounded-full border bg-white"
          >
            <X />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <Field label="Product photos">
            <div className="grid grid-cols-3 gap-3">
              {draft.images.map((image, index) => (
                <div
                  key={image}
                  className="border-pana-ink/10 relative aspect-square overflow-hidden rounded-xl border bg-white"
                >
                  <img
                    src={image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute right-1 bottom-1 left-1 flex justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveImage(index, -1)}
                      className="rounded bg-white p-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImage(index, 1)}
                      className="rounded bg-white p-1"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          images: current.images.filter(
                            (candidate) => candidate !== image
                          ),
                        }))
                      }
                      className="rounded bg-white p-1 text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {draft.images.length < 8 && (
                <label className="border-pana-ink/15 flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white text-center text-xs font-black">
                  {busy ? <Upload className="animate-pulse" /> : <ImagePlus />}
                  <span className="mt-2">Upload photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="sr-only"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          </Field>
          <Field label="Product name">
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                  ...(!current.productId && {
                    slug: slugify(event.target.value),
                  }),
                }))
              }
            />
          </Field>
          <Field label="Description">
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="border-pana-ink/10 min-h-28 w-full rounded-lg border bg-white p-3"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product type">
              <select
                value={draft.kind}
                disabled={!!draft.productId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    kind: event.target.value as ProductKind,
                  }))
                }
                className="border-pana-ink/10 h-10 w-full rounded-lg border bg-white px-3"
              >
                <option value="merchandise">Physical item</option>
                <option value="subscription">Subscription</option>
              </select>
            </Field>
            <Field label="Price">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
              />
            </Field>
            {draft.kind === 'subscription' ? (
              <Field label="Billing interval">
                <select
                  value={draft.recurringInterval}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      recurringInterval: event.target.value as 'month' | 'year',
                    }))
                  }
                  className="border-pana-ink/10 h-10 w-full rounded-lg border bg-white px-3"
                >
                  <option value="month">Monthly</option>
                  <option value="year">Annual</option>
                </select>
              </Field>
            ) : (
              <Field label="Available quantity">
                <Input
                  type="number"
                  min="0"
                  value={draft.availableQuantity}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      availableQuantity: event.target.value,
                    }))
                  }
                />
              </Field>
            )}
            <Field label="Visibility">
              <select
                value={draft.visible ? 'visible' : 'hidden'}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    visible: event.target.value === 'visible',
                  }))
                }
                className="border-pana-ink/10 h-10 w-full rounded-lg border bg-white px-3"
              >
                <option value="visible">Visible in shop</option>
                <option value="hidden">Hidden</option>
              </select>
            </Field>
          </div>
          <Field label="Shop URL">
            <div className="border-pana-ink/10 flex items-center rounded-lg border bg-white pl-3 text-sm">
              <span className="text-pana-ink/50">panamia.club/shop/</span>
              <input
                value={draft.slug}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    slug: slugify(event.target.value),
                  }))
                }
                className="h-10 min-w-0 flex-1 bg-transparent px-1 outline-none"
              />
            </div>
          </Field>
        </div>

        <div className="bg-pana-cream border-pana-ink/10 sticky -bottom-6 mt-8 flex flex-wrap justify-end gap-2 border-t py-4">
          {draft.productId && (
            <Button
              variant="destructive"
              onClick={archiveProduct}
              disabled={busy}
              className="mr-auto"
            >
              <Archive /> Archive
            </Button>
          )}
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={saveProduct} disabled={busy}>
            {busy ? 'Saving…' : 'Save product'}
          </Button>
        </div>
      </aside>
    </div>
  );
}
