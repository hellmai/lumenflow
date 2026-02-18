import { PackCatalogLive } from '../../src/components/pack-catalog-live';

const PAGE_METADATA = {
  title: 'Pack Catalog - LumenFlow',
  description: 'View loaded domain packs with tool and policy visualization.',
} as const;

export const metadata = PAGE_METADATA;

export default function PacksPage() {
  return (
    <main>
      <PackCatalogLive />
    </main>
  );
}
