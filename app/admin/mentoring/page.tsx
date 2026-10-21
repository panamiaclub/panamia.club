'use client';

import { useAdminGate } from '@/components/Admin/gate';
import { AdminPageHeader } from '@/components/Admin/parts';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  IconUsers,
  IconCalendar,
  IconClock,
  IconUserCheck,
  IconUserPlus,
  IconAlertCircle,
  IconRefresh,
} from '@tabler/icons-react';
import { format } from 'date-fns';

const MentoringCharts = dynamic(() => import('./MentoringCharts'), {
  ssr: false,
  loading: () => (
    <p className="py-4 text-sm text-gray-500">Loading charts...</p>
  ),
});

// ── Future: WebRTC Video Session Metrics ─────────────────────────────
// When the WebRTC PoC (app/m/webrtc-test) graduates to production,
// extend this interface to include video session data:
//
//   videoSessions: {
//     total: number;           // total completed video sessions
//     avgDuration: number;     // average session length in minutes
//   };
//   videoReliability: {
//     reconnectRate: number;   // % of sessions with at least one reconnect
//     avgReconnectsPerSession: number;
//   };
//
// Data source: `video_sessions` table in Supabase, populated by the
// SignalingRoom DO on room teardown (POST before SQLite cleanup).
// The admin dashboard queries Supabase only — never DO SQLite directly.
// See worker/signaling-room.ts and api/admin/mentoring/dashboard/route.ts.
// ─────────────────────────────────────────────────────────────────────
interface DashboardMetrics {
  totalMentors: number;
  activeMentors: number;
  sessions: {
    total: number;
    scheduled: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  };
  averageSessionDuration: number;
  topExpertise: Array<{ expertise: string; count: number }>;
  mentorUtilization: {
    totalSessions: number;
    activeMentors: number;
    averagePerMentor: number;
  };
  menteeEngagement: {
    uniqueMentees: number;
    returningMentees: number;
    totalBookings: number;
  };
  cancellationRate: {
    overall: number;
    byMentor: number;
    byMentee: number;
  };
  chartsData: {
    sessionsOverTime: Array<{ date: string; sessions: number }>;
    sessionsByStatus: Array<{ name: string; value: number; color: string }>;
    topExpertiseChart: Array<{ name: string; count: number }>;
  };
}

export default function MentoringDashboard() {
  const { allowed, gate } = useAdminGate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range state (default: last 90 days)
  const [startDate, setStartDate] = useState<string>(
    format(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );

  // Expandable sections state
  const [expandedSections, setExpandedSections] = useState({
    sessionsOverTime: false,
    sessionsByStatus: false,
    topExpertise: false,
  });

  // Hold the request until the session resolves and says staff. This page used
  // to have no access check of any kind, so a curious member rendered the whole
  // dashboard and fired a request that could only ever 401.
  useEffect(() => {
    if (!allowed) return;
    fetchMetrics();
  }, [allowed, startDate, endDate]);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
      });
      const response = await fetch(`/api/admin/mentoring/dashboard?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }
      const data = await response.json();
      console.log('API Response:', data); // Debug logging
      console.log('Metrics:', data.metrics); // Debug logging
      console.log('Sessions:', data.metrics?.sessions); // Debug logging
      setMetrics(data.metrics);
      setError(null);
    } catch (err) {
      console.error('Fetch error:', err); // Debug logging
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
  };

  if (gate) return gate;

  if (loading && !metrics) {
    return (
      <div>
        <AdminPageHeader
          eyebrow="Programs"
          title="Mentoring dashboard"
          description={<p>Loading program metrics…</p>}
        />
        <p>Loading metrics...</p>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div>
        <AdminPageHeader
          eyebrow="Programs"
          title="Mentoring dashboard"
          description={<p>Platform metrics and mentoring performance.</p>}
        />
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">
              Error: {error || 'No data available'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const returningRate =
    metrics.menteeEngagement.uniqueMentees > 0
      ? Math.round(
          (metrics.menteeEngagement.returningMentees /
            metrics.menteeEngagement.uniqueMentees) *
            100
        )
      : 0;

  return (
    <>
      <AdminPageHeader
        eyebrow="Programs"
        title="Mentoring dashboard"
        description={<p>Platform metrics and mentoring program performance.</p>}
      />

      {/* Date Range Filter */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Date Range Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded border px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded border px-3 py-2"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickRange(7)}
              >
                Last 7 days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickRange(30)}
              >
                Last 30 days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickRange(90)}
              >
                Last 90 days
              </Button>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={fetchMetrics}
              disabled={loading}
            >
              <IconRefresh className="mr-1 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Overview Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mentors</CardTitle>
            <IconUsers className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalMentors}</div>
            <p className="text-xs text-gray-500">
              {metrics.activeMentors} active (
              {metrics.totalMentors > 0
                ? Math.round(
                    (metrics.activeMentors / metrics.totalMentors) * 100
                  )
                : 0}
              %)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Sessions
            </CardTitle>
            <IconCalendar className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.sessions.total}</div>
            <p className="text-xs text-gray-500">
              {metrics.sessions.completed} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <IconClock className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.averageSessionDuration}m
            </div>
            <p className="text-xs text-gray-500">Per session</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Cancellation Rate
            </CardTitle>
            <IconAlertCircle className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.cancellationRate.overall}%
            </div>
            <p className="text-xs text-gray-500">
              {metrics.sessions.cancelled} cancelled
            </p>
          </CardContent>
        </Card>
      </div>

      <MentoringCharts
        chartsData={metrics.chartsData}
        expandedSections={expandedSections}
        toggleSection={toggleSection}
      />

      {/* Sessions Breakdown & Other Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Session Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Scheduled
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.sessions.scheduled}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  In Progress
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.sessions.inProgress}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Completed
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.sessions.completed}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Cancelled
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.sessions.cancelled}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cancellation Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Overall Rate
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.cancellationRate.overall}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  By Mentor
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.cancellationRate.byMentor}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  By Mentee
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.cancellationRate.byMentee}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mentor & Mentee Insights */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconUserCheck className="h-5 w-5" />
              Mentor Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Active Mentors
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.mentorUtilization.activeMentors}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Total Sessions
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.mentorUtilization.totalSessions}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Avg Per Mentor
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.mentorUtilization.averagePerMentor}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconUserPlus className="h-5 w-5" />
              Mentee Engagement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Unique Mentees
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.menteeEngagement.uniqueMentees}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Returning Mentees
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.menteeEngagement.returningMentees} ({returningRate}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Total Bookings
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metrics.menteeEngagement.totalBookings}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
