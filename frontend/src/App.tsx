import * as React from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import RequireAuth from "@/components/auth/RequireAuth"
import RequireRadiantAdmin from "@/components/auth/RequireRadiantAdmin"
import SidebarLayout from "@/components/layout/SidebarLayout"
import { AuthProvider } from "@/context/AuthContext"

const LoginPage = React.lazy(() => import("@/components/pages/auth/LoginPage"))
const RegisterPage = React.lazy(() => import("@/components/pages/auth/RegisterPage"))
const TodayPage = React.lazy(() => import("@/components/pages/TodayPage"))
const PipelinePage = React.lazy(() => import("@/components/pages/PipelinePage"))
const PipelineRedirect = React.lazy(() => import("@/components/pages/PipelineRedirect"))
const NewOpportunityPage = React.lazy(() => import("@/components/pages/NewOpportunityPage"))
const OpportunityViewPage = React.lazy(() => import("@/components/pages/OpportunityViewPage"))
const AddContactPage = React.lazy(() => import("@/components/pages/AddContactPage"))
const EditContactPage = React.lazy(() => import("@/components/pages/EditContactPage"))
const AddActivityPage = React.lazy(() => import("@/components/pages/AddActivityPage"))
const SettingsPage = React.lazy(() => import("@/components/pages/SettingsPage"))
const AccountsPage = React.lazy(() => import("@/components/pages/AccountsPage"))
const SignaturePage = React.lazy(() => import("@/components/pages/SignaturePage"))
const TeamManagementPage = React.lazy(() => import("@/components/pages/TeamManagementPage"))
const DevelopersSettingsPage = React.lazy(() => import("@/components/pages/DevelopersSettingsPage"))
const AIPage = React.lazy(() => import("@/components/pages/AIPage"))
const PlaybookItemViewPage = React.lazy(() => import("@/components/pages/PlaybookItemViewPage"))
const PublicDataRoomPage = React.lazy(() => import("@/components/pages/PublicDataRoomPage"))
const ConnectAccount = React.lazy(() => import("@/components/settings/ConnectAccount"))
const EmailEditorTestPage = React.lazy(() => import("@/components/pages/EmailEditorTestPage"))
const MeetingDetailPage = React.lazy(() => import("@/components/pages/MeetingDetailPage"))
const MeetingsPage = React.lazy(() => import("@/components/pages/MeetingsPage"))
const BillingSetupPage = React.lazy(() => import("@/components/pages/BillingSetupPage"))
const BillingSettings = React.lazy(() => import("@/components/settings/BillingSettings"))
const ChangelogPage = React.lazy(() => import("@/components/pages/ChangelogPage"))
const DirectoryPage = React.lazy(() => import("@/components/pages/DirectoryPage"))
const EvalDashboardPage = React.lazy(() => import("@/components/pages/admin/EvalDashboardPage"))
const EvalRunsPage = React.lazy(() => import("@/components/pages/admin/EvalRunsPage"))
const EvalRunDetailPage = React.lazy(() => import("@/components/pages/admin/EvalRunDetailPage"))
const EvalDatasetsPage = React.lazy(() => import("@/components/pages/admin/EvalDatasetsPage"))
const EditDatasetPage = React.lazy(() => import("@/components/pages/admin/EditDatasetPage"))
const EvalTemplatesPage = React.lazy(() => import("@/components/pages/admin/EvalTemplatesPage"))
const EditTemplatePage = React.lazy(() => import("@/components/pages/admin/EditTemplatePage"))
const EvalExperimentsPage = React.lazy(() => import("@/components/pages/admin/EvalExperimentsPage"))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <React.Suspense fallback={
          <div className="min-h-dvh grid place-items-center p-4">
            <div className="rounded-lg border p-6 shadow-sm animate-pulse w-full max-w-sm">
              <div className="h-5 w-32 bg-muted rounded" />
              <div className="mt-2 h-4 w-48 bg-muted rounded" />
              <div className="mt-6 space-y-4">
                <div className="h-10 bg-muted rounded" />
                <div className="h-10 bg-muted rounded" />
                <div className="h-10 bg-muted rounded" />
              </div>
            </div>
          </div>
        }>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/data-room/:uniqueId" element={<PublicDataRoomPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <SidebarLayout />
                </RequireAuth>
              }
            >
              <Route path="today" element={<TodayPage />} />
              <Route path="meetings" element={<MeetingsPage />} />
              <Route path="meetings/:meetingId" element={<MeetingDetailPage />} />
              {/* Pipeline routes - redirect /pipeline to default pipeline */}
              <Route path="pipeline" element={<PipelineRedirect />} />
              <Route path="pipeline/:pipelineId" element={<PipelinePage />} />
              <Route path="pipeline/:pipelineId/new-opportunity" element={<NewOpportunityPage />} />
              <Route path="pipeline/:pipelineId/opportunity/:opportunityId" element={<OpportunityViewPage />} />
              <Route path="pipeline/:pipelineId/opportunity/:opportunityId/add-contact" element={<AddContactPage />} />
              <Route path="pipeline/:pipelineId/opportunity/:opportunityId/edit-contact/:contactId" element={<EditContactPage />} />
              <Route path="pipeline/:pipelineId/opportunity/:opportunityId/add-activity" element={<AddActivityPage />} />
              <Route path="ai" element={<AIPage />} />
              <Route path="ai/playbook/:itemId" element={<PlaybookItemViewPage />} />
              <Route path="ai/playbook/new" element={<PlaybookItemViewPage />} />
              <Route path="ai/email-editor" element={<EmailEditorTestPage />} />
              <Route path="billing/setup" element={<BillingSetupPage />} />
              <Route path="changelog" element={<ChangelogPage />} />
              <Route path="directory" element={<DirectoryPage />} />
              <Route path="settings/*" element={<SettingsPage />}>
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="signature" element={<SignaturePage />} />
                <Route path="team" element={<TeamManagementPage />} />
                <Route path="developers" element={<DevelopersSettingsPage />} />
                <Route path="billing" element={<BillingSettings />} />
              </Route>
              <Route path="connectaccount" element={<ConnectAccount />} /> 
              <Route
                path="admin/evals"
                element={
                  <RequireRadiantAdmin>
                    <EvalDashboardPage />
                  </RequireRadiantAdmin>
                }
              />
              <Route
                path="admin/evals/runs"
                element={
                  <RequireRadiantAdmin>
                    <EvalRunsPage />
                  </RequireRadiantAdmin>
                }
              />
              <Route
                path="admin/evals/runs/:runId"
                element={
                  <RequireRadiantAdmin>
                    <EvalRunDetailPage />
                  </RequireRadiantAdmin>
                }
              />
              <Route
                path="admin/evals/datasets"
                element={
                  <RequireRadiantAdmin>
                    <EvalDatasetsPage />
                  </RequireRadiantAdmin>
                }
              />
              <Route
                path="admin/evals/datasets/:datasetId"
                element={
                  <RequireRadiantAdmin>
                    <EditDatasetPage />
                  </RequireRadiantAdmin>
                }
              />
              <Route
                path="admin/evals/templates"
                element={
                  <RequireRadiantAdmin>
                    <EvalTemplatesPage />
                  </RequireRadiantAdmin>
                }
              />
              <Route
                path="admin/evals/templates/:templateId"
                element={
                  <RequireRadiantAdmin>
                    <EditTemplatePage />
                  </RequireRadiantAdmin>
                }
              />
              <Route
                path="admin/evals/experiments"
                element={
                  <RequireRadiantAdmin>
                    <EvalExperimentsPage />
                  </RequireRadiantAdmin>
                }
              />
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Route>
          </Routes>
        </React.Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
