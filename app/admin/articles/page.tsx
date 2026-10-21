/**
 * Admin Article Management Page
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/activities/actions/
 * Admin interface for managing all articles
 */

'use client';

import { useSession } from '@/lib/auth-client';
import { useAdminGate } from '@/components/Admin/gate';
import { AdminPageHeader } from '@/components/Admin/parts';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  ExternalLink,
  Trash2,
  RotateCcw,
  Search,
  AlertCircle,
} from 'lucide-react';
import PageMeta from '@/components/PageMeta';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import ArticleTypeBadge from '@/components/ArticleTypeBadge';

interface AdminArticle {
  _id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published' | 'removed';
  articleType: 'business_update' | 'community_commentary' | 'staff_update';
  author: {
    screenname?: string;
    name?: string;
    email?: string;
  };
  coAuthorsCount: number;
  publishedAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminArticlesPage() {
  const { data: session } = useSession();
  const { gate } = useAdminGate();
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  // Remove dialog
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [articleToRemove, setArticleToRemove] = useState<AdminArticle | null>(
    null
  );
  const [removalReason, setRemovalReason] = useState('');
  const [removing, setRemoving] = useState(false);

  // Restore dialog
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [articleToRestore, setArticleToRestore] = useState<AdminArticle | null>(
    null
  );
  const [restoring, setRestoring] = useState(false);

  const fetchArticles = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');

      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/admin/articles?${params}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to load articles');
        return;
      }

      setArticles(data.data.articles);
      setPagination(data.data.pagination);
    } catch {
      setError('Failed to load articles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchArticles();
    }
  }, [session, statusFilter, page]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (session) {
        setPage(1);
        fetchArticles();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleRemove = async () => {
    if (!articleToRemove) return;

    setRemoving(true);
    try {
      const response = await fetch(
        `/api/admin/articles/${articleToRemove.slug}/remove`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: removalReason }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setRemoveDialogOpen(false);
        setArticleToRemove(null);
        setRemovalReason('');
        fetchArticles();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to remove article');
    } finally {
      setRemoving(false);
    }
  };

  const handleRestore = async () => {
    if (!articleToRestore) return;

    setRestoring(true);
    try {
      const response = await fetch(
        `/api/admin/articles/${articleToRestore.slug}/restore`,
        {
          method: 'POST',
        }
      );

      const data = await response.json();

      if (data.success) {
        setRestoreDialogOpen(false);
        setArticleToRestore(null);
        fetchArticles();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to restore article');
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      published:
        'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      removed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    };

    return (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.draft}`}
      >
        {status}
      </span>
    );
  };

  if (gate) return gate;

  return (
    <>
      <PageMeta title="Articles | Admin" desc="" />

      <AdminPageHeader
        eyebrow="Publishing"
        title="Article management"
        description={<p>View and moderate all community articles.</p>}
      />

      {/* Filters */}
      <div className="border-pana-ink/10 mb-6 flex flex-wrap gap-4 rounded-2xl border bg-white p-3 shadow-[0_8px_24px_rgb(17_13_13_/_0.05)]">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or slug..."
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="removed">Removed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-md bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Articles List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            No articles found
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {articles.map((article) => (
            <Card key={article._id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {getStatusBadge(article.status)}
                      <ArticleTypeBadge type={article.articleType} />
                    </div>
                    <h3 className="line-clamp-1 font-semibold">
                      {article.title || 'Untitled'}
                    </h3>
                    <div className="mt-1 text-sm text-gray-500">
                      by{' '}
                      {article.author.screenname
                        ? `@${article.author.screenname}`
                        : article.author.name || article.author.email}
                      {article.coAuthorsCount > 0 && (
                        <span> (+{article.coAuthorsCount} co-authors)</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      Created: {formatDate(article.createdAt)}
                      {article.publishedAt && (
                        <> · Published: {formatDate(article.publishedAt)}</>
                      )}
                    </div>
                    {article.status === 'removed' && (
                      <div className="mt-2 rounded-md bg-red-50 p-2 text-sm dark:bg-red-900/20">
                        <p className="text-red-700 dark:text-red-400">
                          Removed by {article.deletedBy || 'Admin'} on{' '}
                          {article.deletedAt && formatDate(article.deletedAt)}
                        </p>
                        {article.deletionReason && (
                          <p className="mt-1 text-red-600 dark:text-red-300">
                            Reason: {article.deletionReason}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {article.status === 'published' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="gap-1"
                        >
                          <Link href={`/a/${article.slug}`} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                            View
                          </Link>
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1"
                          onClick={() => {
                            setArticleToRemove(article);
                            setRemoveDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </>
                    )}
                    {article.status === 'removed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => {
                          setArticleToRestore(article);
                          setRestoreDialogOpen(true);
                        }}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() =>
              setPage((p) => Math.min(pagination.totalPages, p + 1))
            }
            disabled={page === pagination.totalPages}
          >
            Next
          </Button>
        </div>
      )}

      {/* Remove Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Article</DialogTitle>
            <DialogDescription>
              This will remove the article from public view. Authors will be
              notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm font-medium">Article:</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {articleToRemove?.title}
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">
                Reason for removal (required)
              </label>
              <Textarea
                value={removalReason}
                onChange={(e) => setRemovalReason(e.target.value)}
                placeholder="Explain why this article is being removed..."
                rows={3}
              />
              <p className="mt-1 text-xs text-gray-500">
                Minimum 10 characters. This will be shared with the author(s).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRemoveDialogOpen(false);
                setRemovalReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removing || removalReason.trim().length < 10}
            >
              {removing ? 'Removing...' : 'Remove Article'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Article</DialogTitle>
            <DialogDescription>
              This will restore the article and make it publicly visible again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div>
              <p className="text-sm font-medium">Article:</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {articleToRestore?.title}
              </p>
            </div>
            {articleToRestore?.deletionReason && (
              <div className="mt-4 rounded-md bg-gray-50 p-3 dark:bg-gray-800">
                <p className="text-sm font-medium">Original removal reason:</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {articleToRestore.deletionReason}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRestoreDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleRestore} disabled={restoring}>
              {restoring ? 'Restoring...' : 'Restore Article'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
