import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProductCard } from '@/components/shop/product-card';
import { getShopPriceBySlug } from '@/lib/shop/stripe';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const product = await getShopPriceBySlug((await params).slug);
  return product
    ? {
        title: `${product.name} | Pana Shop`,
        description: product.description ?? undefined,
      }
    : { title: 'Product not found | Pana Shop' };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getShopPriceBySlug((await params).slug);
  if (!product) notFound();

  return (
    <main className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-xl">
        <ProductCard price={product} />
      </div>
    </main>
  );
}
