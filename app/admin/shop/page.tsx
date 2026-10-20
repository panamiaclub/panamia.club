'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAdminGate } from '@/components/Admin/gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSession } from '@/lib/auth-client';

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
  totalCents: number;
  trackingNumber: string | null;
  trackingUrl: string | null;
  items: OrderItem[];
}

interface Inventory {
  stripePriceId: string;
  availableQuantity: number;
  reservedQuantity: number;
  trackInventory: boolean;
}

export default function AdminShopPage() {
  const { data: session } = useSession();
  const { gate } = useAdminGate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/admin/shop');
    if (!response.ok) {
      setMessage('Could not load shop operations.');
      setLoading(false);
      return;
    }
    const result = (await response.json()) as {
      orders: Order[];
      inventory: Inventory[];
    };
    setOrders(result.orders);
    setInventory(result.inventory);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user) void load();
  }, [load, session?.user]);

  async function updateOrder(
    orderId: string,
    fulfillmentStatus: string,
    trackingNumber: string | null,
    trackingUrl: string | null
  ) {
    await fetch('/api/admin/shop', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        fulfillmentStatus,
        trackingNumber,
        trackingUrl,
      }),
    });
    await load();
  }

  async function updateInventory(row: Inventory, quantity: number) {
    await fetch('/api/admin/shop', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId: row.stripePriceId,
        availableQuantity: quantity,
        trackInventory: row.trackInventory,
      }),
    });
    await load();
  }

  async function syncInventory() {
    const response = await fetch('/api/admin/shop', { method: 'POST' });
    const result = (await response.json()) as {
      synced?: number;
      error?: string;
    };
    setMessage(
      response.ok
        ? `Synced ${result.synced ?? 0} Stripe prices.`
        : result.error || 'Sync failed.'
    );
    await load();
  }

  if (gate) return gate;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-pana-burnt-deep text-sm font-black tracking-widest uppercase">
            Commerce
          </p>
          <h1 className="mt-1 text-4xl font-black">Shop operations</h1>
        </div>
        <Button onClick={syncInventory}>Sync Stripe inventory</Button>
      </div>
      {message && <p className="mt-4 text-sm">{message}</p>}

      <section className="mt-10">
        <h2 className="text-2xl font-black">Inventory</h2>
        <p className="text-pana-ink/65 mt-1 text-sm">
          Products and prices stay in Stripe. Quantities and reservations live
          here.
        </p>
        <div className="mt-4 space-y-3">
          {inventory.map((row) => (
            <InventoryRow
              key={row.stripePriceId}
              row={row}
              onSave={updateInventory}
            />
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-black">Recent orders</h2>
        {loading ? (
          <p className="mt-4">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} onSave={updateOrder} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function InventoryRow({
  row,
  onSave,
}: {
  row: Inventory;
  onSave: (row: Inventory, quantity: number) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(row.availableQuantity);
  return (
    <div className="border-pana-ink/10 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[1fr_8rem_auto] md:items-center">
      <div>
        <p className="font-mono text-xs">{row.stripePriceId}</p>
        <p className="text-pana-ink/65 text-sm">
          {row.reservedQuantity} currently reserved
        </p>
      </div>
      <Input
        type="number"
        min={row.reservedQuantity}
        value={quantity}
        onChange={(event) => setQuantity(Number(event.target.value))}
      />
      <Button variant="outline" onClick={() => onSave(row, quantity)}>
        Save stock
      </Button>
    </div>
  );
}

function OrderRow({
  order,
  onSave,
}: {
  order: Order;
  onSave: (
    orderId: string,
    status: string,
    trackingNumber: string | null,
    trackingUrl: string | null
  ) => Promise<void>;
}) {
  const [status, setStatus] = useState(order.fulfillmentStatus);
  const [trackingNumber, setTrackingNumber] = useState(
    order.trackingNumber ?? ''
  );
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl ?? '');
  return (
    <article className="border-pana-ink/10 rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="font-black">{order.email ?? 'Email pending'}</p>
          <p className="text-pana-ink/60 text-xs">
            {order.id} · {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="font-black">${(order.totalCents / 100).toFixed(2)}</p>
          <p className="text-sm capitalize">
            {order.status.replaceAll('_', ' ')}
          </p>
        </div>
      </div>
      <ul className="mt-4 text-sm">
        {order.items.map((item) => (
          <li key={item.id}>
            {item.productName} × {item.quantity}
          </li>
        ))}
      </ul>
      {order.kind === 'merchandise' && (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="border-input bg-background h-10 rounded-md border px-3 text-sm"
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
          />
          <Button
            className="md:col-start-3"
            onClick={() =>
              onSave(order.id, status, trackingNumber, trackingUrl)
            }
          >
            Save fulfillment
          </Button>
        </div>
      )}
    </article>
  );
}
