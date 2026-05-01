import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { MCPServersState } from "agents";
import type { ChatAgent } from "./server";
import {
  Badge,
  Button,
  Empty,
  InputArea,
  Surface,
  Switch,
  Text
} from "@cloudflare/kumo";
import { Toasty, useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  GearIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  MoonIcon,
  SunIcon,
  CheckCircleIcon,
  XCircleIcon,
  BrainIcon,
  CaretDownIcon,
  BugIcon,
  PlugsConnectedIcon,
  PlusIcon,
  SignInIcon,
  XIcon,
  WrenchIcon,
  PaperclipIcon,
  ImageIcon,
  EnvelopeSimpleIcon,
  ChatTextIcon,
  PencilSimpleIcon,
  FloppyDiskIcon,
  ArrowCounterClockwiseIcon,
  WarningIcon
} from "@phosphor-icons/react";

// ── Attachment helpers ────────────────────────────────────────────────

interface Attachment {
  id: string;
  file: File;
  preview: string;
  mediaType: string;
}

function createAttachment(file: File): Attachment {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    preview: URL.createObjectURL(file),
    mediaType: file.type || "application/octet-stream"
  };
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Small components ──────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [dark]);

  return (
    <Button
      variant="secondary"
      shape="square"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle theme"
    />
  );
}

// ── Outreach review (Approve / Modify / Reject) ───────────────────────

type OutreachDecision = "pending" | "approved" | "rejected" | "modified";

interface OutreachState {
  decision: OutreachDecision;
  emailSubject: string;
  emailBody: string;
  smsMessage: string;
  rejectionReason?: string;
}

interface OutreachPlan {
  pdfPreview?: {
    title?: string;
    date?: string;
    patient?: string;
    riskLevel?: string;
    priority?: string;
  };
  emailDraft?: { to?: string; subject?: string; body?: string };
  smsDraft?: { phone?: string; message?: string };
  actionItems?: Array<string | null>;
  estimatedImpact?: string;
}

function OutreachReviewCard({
  toolCallId,
  patient,
  plan,
  state,
  onChange,
  onApprove,
  onReject,
  isStreaming
}: {
  toolCallId: string;
  patient: string;
  plan: OutreachPlan;
  state: OutreachState;
  onChange: (next: OutreachState) => void;
  onApprove: (modified: boolean) => void;
  onReject: (reason: string) => void;
  isStreaming: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const decisionLocked =
    state.decision === "approved" || state.decision === "rejected";

  const pdf = plan.pdfPreview ?? {};
  const actionItems = (plan.actionItems ?? []).filter(
    (a): a is string => typeof a === "string" && a.length > 0
  );

  const riskBadgeClass =
    pdf.riskLevel === "CRITICAL"
      ? "bg-red-500/15 text-red-500 ring-1 ring-red-500/30"
      : pdf.riskLevel === "HIGH"
        ? "bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30"
        : "bg-yellow-500/15 text-yellow-600 ring-1 ring-yellow-500/30";

  const decisionBadge =
    state.decision === "approved" ? (
      <Badge variant="primary" className="bg-green-500/20 text-green-500">
        <CheckCircleIcon size={12} className="mr-1" weight="bold" />
        Approved — queued to send
      </Badge>
    ) : state.decision === "rejected" ? (
      <Badge variant="destructive">
        <XCircleIcon size={12} className="mr-1" weight="bold" />
        Rejected
      </Badge>
    ) : state.decision === "modified" ? (
      <Badge variant="primary" className="bg-blue-500/20 text-blue-500">
        <PencilSimpleIcon size={12} className="mr-1" weight="bold" />
        Modified by coordinator
      </Badge>
    ) : (
      <Badge variant="secondary">
        <WarningIcon size={12} className="mr-1" weight="bold" />
        Awaiting review
      </Badge>
    );

  return (
    <div className="flex justify-start">
      <Surface
        className="max-w-[85%] w-full px-4 py-4 rounded-xl ring-2 ring-kumo-brand/30 bg-gradient-to-br from-kumo-base to-kumo-elevated space-y-4"
        data-tool-call-id={toolCallId}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">✉️</span>
            <div>
              <Text size="sm" bold DANGEROUS_className="text-kumo-default">
                Outreach Generator Agent
              </Text>
              <Text size="xs" variant="secondary">
                Personalized intervention for {patient}
              </Text>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {pdf.riskLevel && (
              <span
                className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${riskBadgeClass}`}
              >
                {pdf.riskLevel}
              </span>
            )}
            {decisionBadge}
          </div>
        </div>

        {/* Priority banner */}
        {pdf.priority && (
          <div className="px-3 py-2 rounded-lg bg-kumo-control border border-kumo-line">
            <Text size="xs" variant="secondary" bold>
              Priority
            </Text>
            <Text size="sm" DANGEROUS_className="text-kumo-default">
              {pdf.priority}
            </Text>
          </div>
        )}

        {/* Email draft */}
        <div className="rounded-lg border border-kumo-line overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-kumo-control border-b border-kumo-line">
            <EnvelopeSimpleIcon size={14} className="text-kumo-brand" />
            <Text size="xs" bold DANGEROUS_className="text-kumo-default">
              Email draft
            </Text>
            {plan.emailDraft?.to && (
              <Text size="xs" variant="secondary" DANGEROUS_className="ml-auto font-mono">
                to: {plan.emailDraft.to}
              </Text>
            )}
          </div>
          <div className="p-3 space-y-2">
            <div>
              <Text size="xs" variant="secondary" bold>
                Subject
              </Text>
              {editing ? (
                <input
                  type="text"
                  value={state.emailSubject}
                  onChange={(e) =>
                    onChange({ ...state, emailSubject: e.target.value })
                  }
                  className="w-full mt-1 px-2 py-1 text-sm rounded border border-kumo-line bg-kumo-base text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-accent"
                />
              ) : (
                <Text size="sm" DANGEROUS_className="text-kumo-default mt-0.5">
                  {state.emailSubject}
                </Text>
              )}
            </div>
            <div>
              <Text size="xs" variant="secondary" bold>
                Body
              </Text>
              {editing ? (
                <textarea
                  value={state.emailBody}
                  onChange={(e) =>
                    onChange({ ...state, emailBody: e.target.value })
                  }
                  rows={Math.min(
                    16,
                    Math.max(6, state.emailBody.split("\n").length + 1)
                  )}
                  className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-kumo-line bg-kumo-base text-kumo-default font-mono focus:outline-none focus:ring-1 focus:ring-kumo-accent resize-y"
                />
              ) : (
                <pre className="mt-0.5 px-2 py-1.5 text-xs whitespace-pre-wrap font-sans rounded bg-kumo-control text-kumo-default leading-relaxed">
                  {state.emailBody}
                </pre>
              )}
            </div>
          </div>
        </div>

        {/* SMS draft */}
        <div className="rounded-lg border border-kumo-line overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-kumo-control border-b border-kumo-line">
            <ChatTextIcon size={14} className="text-kumo-brand" />
            <Text size="xs" bold DANGEROUS_className="text-kumo-default">
              SMS draft
            </Text>
            {plan.smsDraft?.phone && (
              <Text size="xs" variant="secondary" DANGEROUS_className="ml-auto font-mono">
                {plan.smsDraft.phone}
              </Text>
            )}
          </div>
          <div className="p-3">
            {editing ? (
              <textarea
                value={state.smsMessage}
                onChange={(e) =>
                  onChange({ ...state, smsMessage: e.target.value })
                }
                rows={3}
                className="w-full px-2 py-1.5 text-sm rounded border border-kumo-line bg-kumo-base text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-accent resize-y"
              />
            ) : (
              <Text size="sm" DANGEROUS_className="text-kumo-default whitespace-pre-wrap">
                {state.smsMessage}
              </Text>
            )}
          </div>
        </div>

        {/* Action items + impact */}
        {(actionItems.length > 0 || plan.estimatedImpact) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {actionItems.length > 0 && (
              <div className="rounded-lg border border-kumo-line p-3">
                <Text size="xs" variant="secondary" bold>
                  Action items
                </Text>
                <ul className="mt-1 space-y-0.5">
                  {actionItems.map((item, idx) => (
                    <li key={idx} className="text-xs text-kumo-default">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan.estimatedImpact && (
              <div className="rounded-lg border border-kumo-line p-3">
                <Text size="xs" variant="secondary" bold>
                  Estimated impact
                </Text>
                <Text size="sm" DANGEROUS_className="text-kumo-default mt-0.5">
                  {plan.estimatedImpact}
                </Text>
              </div>
            )}
          </div>
        )}

        {/* Rejection reason (when rejected) */}
        {state.decision === "rejected" && state.rejectionReason && (
          <div className="px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
            <Text size="xs" variant="secondary" bold>
              Rejection reason
            </Text>
            <Text size="sm" DANGEROUS_className="text-kumo-default">
              {state.rejectionReason}
            </Text>
          </div>
        )}

        {/* Reject feedback box */}
        {showRejectBox && !decisionLocked && (
          <div className="px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
            <Text size="xs" variant="secondary" bold>
              Why are you rejecting? The agent will use this to regenerate.
            </Text>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Tone is too clinical, patient prefers SMS over email, timing won't work..."
              rows={2}
              className="w-full px-2 py-1.5 text-sm rounded border border-kumo-line bg-kumo-base text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-accent resize-y"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={!rejectReason.trim() || isStreaming}
                icon={<XCircleIcon size={14} />}
                onClick={() => {
                  onReject(rejectReason.trim());
                  setShowRejectBox(false);
                }}
              >
                Confirm reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowRejectBox(false);
                  setRejectReason("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!decisionLocked && !showRejectBox && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {editing ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<FloppyDiskIcon size={14} />}
                  onClick={() => {
                    onChange({ ...state, decision: "modified" });
                    setEditing(false);
                  }}
                >
                  Save changes
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArrowCounterClockwiseIcon size={14} />}
                  onClick={() => {
                    onChange({
                      ...state,
                      emailSubject: plan.emailDraft?.subject ?? "",
                      emailBody: plan.emailDraft?.body ?? "",
                      smsMessage: plan.smsDraft?.message ?? "",
                      decision: "pending"
                    });
                    setEditing(false);
                  }}
                >
                  Discard edits
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isStreaming}
                  icon={<CheckCircleIcon size={14} />}
                  onClick={() =>
                    onApprove(state.decision === "modified")
                  }
                >
                  Approve & queue to send
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<PencilSimpleIcon size={14} />}
                  onClick={() => setEditing(true)}
                >
                  Modify
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isStreaming}
                  icon={<XCircleIcon size={14} />}
                  onClick={() => setShowRejectBox(true)}
                >
                  Reject
                </Button>
              </>
            )}
          </div>
        )}
      </Surface>
    </div>
  );
}

// ── Tool rendering ────────────────────────────────────────────────────

function ToolPartView({
  part,
  addToolApprovalResponse,
  outreachState,
  setOutreachState,
  onOutreachDecision,
  isStreaming
}: {
  part: UIMessage["parts"][number];
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
  outreachState: Record<string, OutreachState>;
  setOutreachState: (id: string, next: OutreachState) => void;
  onOutreachDecision: (
    decision: "approved" | "rejected",
    args: {
      toolCallId: string;
      patient: string;
      modified: boolean;
      emailSubject: string;
      emailBody: string;
      smsMessage: string;
      rejectionReason?: string;
    }
  ) => void;
  isStreaming: boolean;
}) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);

  // Completed
  if (part.state === "output-available") {
    const output = part.output as any;
    const isAgentOutput = output?.agent && output?.status;

    // Outreach plan review card (Approve / Modify / Reject)
    if (
      toolName === "generateOutreachPlan" &&
      output?.outreachPlan?.emailDraft
    ) {
      const toolCallId = part.toolCallId;
      const plan = output.outreachPlan as OutreachPlan;
      const patient = output.patient ?? "patient";
      const state: OutreachState = outreachState[toolCallId] ?? {
        decision: "pending",
        emailSubject: plan.emailDraft?.subject ?? "",
        emailBody: plan.emailDraft?.body ?? "",
        smsMessage: plan.smsDraft?.message ?? ""
      };
      return (
        <OutreachReviewCard
          toolCallId={toolCallId}
          patient={patient}
          plan={plan}
          state={state}
          isStreaming={isStreaming}
          onChange={(next) => setOutreachState(toolCallId, next)}
          onApprove={(modified) => {
            const next: OutreachState = {
              ...state,
              decision: "approved"
            };
            setOutreachState(toolCallId, next);
            onOutreachDecision("approved", {
              toolCallId,
              patient,
              modified: modified || state.decision === "modified",
              emailSubject: state.emailSubject,
              emailBody: state.emailBody,
              smsMessage: state.smsMessage
            });
          }}
          onReject={(reason) => {
            const next: OutreachState = {
              ...state,
              decision: "rejected",
              rejectionReason: reason
            };
            setOutreachState(toolCallId, next);
            onOutreachDecision("rejected", {
              toolCallId,
              patient,
              modified: false,
              emailSubject: state.emailSubject,
              emailBody: state.emailBody,
              smsMessage: state.smsMessage,
              rejectionReason: reason
            });
          }}
        />
      );
    }

    // Enhanced UI for Sub-Agent outputs
    if (isAgentOutput) {
      const agentEmoji = output.agent?.includes("Risk") ? "🎯" :
                        output.agent?.includes("Clinical") ? "📋" :
                        output.agent?.includes("Barrier") ? "🚧" :
                        output.agent?.includes("Outreach") ? "✉️" : "⚙️";

      const statusColor = output.status === "completed" ? "text-kumo-success" :
                         output.status === "awaiting_approval" ? "text-kumo-warning" :
                         "text-kumo-brand";

      return (
        <div className="flex justify-start">
          <Surface className="max-w-[85%] px-4 py-3 rounded-xl ring-2 ring-kumo-brand/20 bg-gradient-to-br from-kumo-base to-kumo-elevated">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{agentEmoji}</span>
              <Text size="sm" bold DANGEROUS_className="text-kumo-default">
                {output.agent}
              </Text>
              <Badge variant="primary" className={statusColor}>
                {output.status === "completed" ? "✓ Completed" :
                 output.status === "awaiting_approval" ? "⏳ Awaiting Approval" :
                 output.status}
              </Badge>
            </div>
            {output.summary && (
              <div className="mb-2">
                <Text size="sm" variant="secondary">{output.summary}</Text>
              </div>
            )}
            {output.message && (
              <div className="mb-2">
                <Text size="sm">{output.message}</Text>
              </div>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-kumo-subtle hover:text-kumo-default">
                View detailed output
              </summary>
              <div className="font-mono mt-2 p-2 rounded bg-kumo-control">
                <Text size="xs" variant="secondary">
                  {JSON.stringify(output, null, 2)}
                </Text>
              </div>
            </details>
          </Surface>
        </div>
      );
    }

    // Default UI for non-agent tools
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2 mb-1">
            <GearIcon size={14} className="text-kumo-inactive" />
            <Text size="xs" variant="secondary" bold>
              {toolName}
            </Text>
            <Badge variant="secondary">Done</Badge>
          </div>
          <div className="font-mono">
            <Text size="xs" variant="secondary">
              {JSON.stringify(part.output, null, 2)}
            </Text>
          </div>
        </Surface>
      </div>
    );
  }

  // Needs approval
  if ("approval" in part && part.state === "approval-requested") {
    const approvalId = (part.approval as { id?: string })?.id;
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-3 rounded-xl ring-2 ring-kumo-warning">
          <div className="flex items-center gap-2 mb-2">
            <GearIcon size={14} className="text-kumo-warning" />
            <Text size="sm" bold>
              Approval needed: {toolName}
            </Text>
          </div>
          <div className="font-mono mb-3">
            <Text size="xs" variant="secondary">
              {JSON.stringify(part.input, null, 2)}
            </Text>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: true });
                }
              }}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: false });
                }
              }}
            >
              Reject
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  // Rejected / denied
  if (
    part.state === "output-denied" ||
    ("approval" in part &&
      (part.approval as { approved?: boolean })?.approved === false)
  ) {
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <XCircleIcon size={14} className="text-kumo-danger" />
            <Text size="xs" variant="secondary" bold>
              {toolName}
            </Text>
            <Badge variant="secondary">Rejected</Badge>
          </div>
        </Surface>
      </div>
    );
  }

  // Executing
  if (part.state === "input-available" || part.state === "input-streaming") {
    // Enhanced UI for sub-agent execution
    const isSubAgent = toolName.includes("rank") || toolName.includes("analyze") ||
                      toolName.includes("detect") || toolName.includes("generate");

    const agentName = toolName.includes("rank") ? "🎯 Risk Ranking Agent" :
                     toolName.includes("analyze") ? "📋 Clinical Profile Agent" :
                     toolName.includes("detect") ? "🚧 Barrier Detection Agent" :
                     toolName.includes("generate") ? "✉️ Outreach Generator Agent" :
                     toolName;

    const agentAction = toolName.includes("rank") ? "Calculating risk scores..." :
                       toolName.includes("analyze") ? "Pulling medical records..." :
                       toolName.includes("detect") ? "Analyzing SDOH barriers..." :
                       toolName.includes("generate") ? "Creating outreach plan..." :
                       `Running ${toolName}...`;

    if (isSubAgent) {
      return (
        <div className="flex justify-start">
          <Surface className="max-w-[85%] px-4 py-3 rounded-xl ring-2 ring-kumo-brand bg-gradient-to-r from-kumo-brand/5 to-kumo-brand/10 animate-pulse">
            <div className="flex items-center gap-2">
              <GearIcon size={16} className="text-kumo-brand animate-spin" />
              <div>
                <Text size="sm" bold DANGEROUS_className="text-kumo-default">
                  {agentName}
                </Text>
                <Text size="xs" variant="secondary" DANGEROUS_className="mt-0.5">
                  {agentAction}
                </Text>
              </div>
              <Badge variant="primary" className="ml-auto">Running</Badge>
            </div>
          </Surface>
        </div>
      );
    }

    // Default for non-agent tools
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <GearIcon size={14} className="text-kumo-inactive animate-spin" />
            <Text size="xs" variant="secondary">
              Running {toolName}...
            </Text>
          </div>
        </Surface>
      </div>
    );
  }

  return null;
}

// ── Main chat ─────────────────────────────────────────────────────────

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [outreachState, setOutreachStateMap] = useState<
    Record<string, OutreachState>
  >({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toasts = useKumoToastManager();
  const [mcpState, setMcpState] = useState<MCPServersState>({
    prompts: [],
    resources: [],
    servers: {},
    tools: []
  });
  const [showMcpPanel, setShowMcpPanel] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [isAddingServer, setIsAddingServer] = useState(false);
  const mcpPanelRef = useRef<HTMLDivElement>(null);

  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    ),
    onMcpUpdate: useCallback((state: MCPServersState) => {
      setMcpState(state);
    }, []),
    onMessage: useCallback(
      (message: MessageEvent) => {
        try {
          const data = JSON.parse(String(message.data));
          if (data.type === "scheduled-task") {
            toasts.add({
              title: "Scheduled task completed",
              description: data.description,
              timeout: 0
            });
          }
        } catch {
          // Not JSON or not our event
        }
      },
      [toasts]
    )
  });

  // Close MCP panel when clicking outside
  useEffect(() => {
    if (!showMcpPanel) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        mcpPanelRef.current &&
        !mcpPanelRef.current.contains(e.target as Node)
      ) {
        setShowMcpPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMcpPanel]);

  const handleAddServer = async () => {
    if (!mcpName.trim() || !mcpUrl.trim()) return;
    setIsAddingServer(true);
    try {
      await agent.stub.addServer(mcpName.trim(), mcpUrl.trim());
      setMcpName("");
      setMcpUrl("");
    } catch (e) {
      console.error("Failed to add MCP server:", e);
    } finally {
      setIsAddingServer(false);
    }
  };

  const handleRemoveServer = async (serverId: string) => {
    try {
      await agent.stub.removeServer(serverId);
    } catch (e) {
      console.error("Failed to remove MCP server:", e);
    }
  };

  const serverEntries = Object.entries(mcpState.servers);
  const mcpToolCount = mcpState.tools.length;

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status
  } = useAgentChat({
    agent,
    onToolCall: async (event) => {
      if (
        "addToolOutput" in event &&
        event.toolCall.toolName === "getUserTimezone"
      ) {
        event.addToolOutput({
          toolCallId: event.toolCall.toolCallId,
          output: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            localTime: new Date().toLocaleTimeString()
          }
        });
      }
    }
  });

  const isStreaming = status === "streaming" || status === "submitted";

  const setOutreachState = useCallback(
    (id: string, next: OutreachState) => {
      setOutreachStateMap((prev) => {
        const existing = prev[id];
        if (
          existing &&
          existing.decision === next.decision &&
          existing.emailSubject === next.emailSubject &&
          existing.emailBody === next.emailBody &&
          existing.smsMessage === next.smsMessage &&
          existing.rejectionReason === next.rejectionReason
        ) {
          return prev;
        }
        return { ...prev, [id]: next };
      });
    },
    []
  );

  const handleOutreachDecision = useCallback(
    (
      decision: "approved" | "rejected",
      args: {
        toolCallId: string;
        patient: string;
        modified: boolean;
        emailSubject: string;
        emailBody: string;
        smsMessage: string;
        rejectionReason?: string;
      }
    ) => {
      let text: string;
      if (decision === "approved") {
        const verb = args.modified
          ? "approved (with my edits)"
          : "approved as-is";
        text =
          `Coordinator decision for ${args.patient}: outreach plan ${verb}. ` +
          `Mark this intervention as queued to send and let me know what to tackle next.`;
        if (args.modified) {
          text +=
            `\n\nFinal email subject: ${args.emailSubject}` +
            `\n\nFinal email body:\n${args.emailBody}` +
            `\n\nFinal SMS:\n${args.smsMessage}`;
        }
      } else {
        text =
          `Coordinator decision for ${args.patient}: outreach plan rejected. ` +
          `Reason: ${args.rejectionReason ?? "(no reason given)"}. ` +
          `Please regenerate generateOutreachPlan with adjustments that address this concern.`;
      }
      sendMessage({ role: "user", parts: [{ type: "text", text }] });
    },
    [sendMessage]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Re-focus the input after streaming ends
  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setAttachments((prev) => [...prev, ...images.map(createAttachment)]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att) URL.revokeObjectURL(att.preview);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles]
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    setInput("");

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mediaType: string; url: string }
    > = [];
    if (text) parts.push({ type: "text", text });

    for (const att of attachments) {
      const dataUri = await fileToDataUri(att.file);
      parts.push({ type: "file", mediaType: att.mediaType, url: dataUri });
    }

    for (const att of attachments) URL.revokeObjectURL(att.preview);
    setAttachments([]);

    sendMessage({ role: "user", parts });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, attachments, isStreaming, sendMessage]);

  return (
    <div
      className="flex flex-col h-screen bg-kumo-elevated relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-kumo-elevated/80 backdrop-blur-sm border-2 border-dashed border-kumo-brand rounded-xl m-2 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-kumo-brand">
            <ImageIcon size={40} />
            <Text variant="heading3">Drop images here</Text>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-kumo-default">
              <span className="mr-2">⛅</span>Agent Starter
            </h1>
            <Badge variant="secondary">
              <ChatCircleDotsIcon size={12} weight="bold" className="mr-1" />
              AI Chat
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <CircleIcon
                size={8}
                weight="fill"
                className={connected ? "text-kumo-success" : "text-kumo-danger"}
              />
              <Text size="xs" variant="secondary">
                {connected ? "Connected" : "Disconnected"}
              </Text>
            </div>
            <div className="flex items-center gap-1.5">
              <BugIcon size={14} className="text-kumo-inactive" />
              <Switch
                checked={showDebug}
                onCheckedChange={setShowDebug}
                size="sm"
                aria-label="Toggle debug mode"
              />
            </div>
            <ThemeToggle />
            <div className="relative" ref={mcpPanelRef}>
              <Button
                variant="secondary"
                icon={<PlugsConnectedIcon size={16} />}
                onClick={() => setShowMcpPanel(!showMcpPanel)}
              >
                MCP
                {mcpToolCount > 0 && (
                  <Badge variant="primary" className="ml-1.5">
                    <WrenchIcon size={10} className="mr-0.5" />
                    {mcpToolCount}
                  </Badge>
                )}
              </Button>

              {/* MCP Dropdown Panel */}
              {showMcpPanel && (
                <div className="absolute right-0 top-full mt-2 w-96 z-50">
                  <Surface className="rounded-xl ring ring-kumo-line shadow-lg p-4 space-y-4">
                    {/* Panel Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PlugsConnectedIcon
                          size={16}
                          className="text-kumo-accent"
                        />
                        <Text size="sm" bold>
                          MCP Servers
                        </Text>
                        {serverEntries.length > 0 && (
                          <Badge variant="secondary">
                            {serverEntries.length}
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        shape="square"
                        aria-label="Close MCP panel"
                        icon={<XIcon size={14} />}
                        onClick={() => setShowMcpPanel(false)}
                      />
                    </div>

                    {/* Add Server Form */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddServer();
                      }}
                      className="space-y-2"
                    >
                      <input
                        type="text"
                        value={mcpName}
                        onChange={(e) => setMcpName(e.target.value)}
                        placeholder="Server name"
                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={mcpUrl}
                          onChange={(e) => setMcpUrl(e.target.value)}
                          placeholder="https://mcp.example.com"
                          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent font-mono"
                        />
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          icon={<PlusIcon size={14} />}
                          disabled={
                            isAddingServer || !mcpName.trim() || !mcpUrl.trim()
                          }
                        >
                          {isAddingServer ? "..." : "Add"}
                        </Button>
                      </div>
                    </form>

                    {/* Server List */}
                    {serverEntries.length > 0 && (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {serverEntries.map(([id, server]) => (
                          <div
                            key={id}
                            className="flex items-start justify-between p-2.5 rounded-lg border border-kumo-line"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-kumo-default truncate">
                                  {server.name}
                                </span>
                                <Badge
                                  variant={
                                    server.state === "ready"
                                      ? "primary"
                                      : server.state === "failed"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {server.state}
                                </Badge>
                              </div>
                              <span className="text-xs font-mono text-kumo-subtle truncate block mt-0.5">
                                {server.server_url}
                              </span>
                              {server.state === "failed" && server.error && (
                                <span className="text-xs text-red-500 block mt-0.5">
                                  {server.error}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              {server.state === "authenticating" &&
                                server.auth_url && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    icon={<SignInIcon size={12} />}
                                    onClick={() =>
                                      window.open(
                                        server.auth_url as string,
                                        "oauth",
                                        "width=600,height=800"
                                      )
                                    }
                                  >
                                    Auth
                                  </Button>
                                )}
                              <Button
                                variant="ghost"
                                size="sm"
                                shape="square"
                                aria-label="Remove server"
                                icon={<TrashIcon size={12} />}
                                onClick={() => handleRemoveServer(id)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tool Summary */}
                    {mcpToolCount > 0 && (
                      <div className="pt-2 border-t border-kumo-line">
                        <div className="flex items-center gap-2">
                          <WrenchIcon size={14} className="text-kumo-subtle" />
                          <span className="text-xs text-kumo-subtle">
                            {mcpToolCount} tool
                            {mcpToolCount !== 1 ? "s" : ""} available from MCP
                            servers
                          </span>
                        </div>
                      </div>
                    )}
                  </Surface>
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              icon={<TrashIcon size={16} />}
              onClick={clearHistory}
            >
              Clear
            </Button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && (
            <Empty
              icon={<ChatCircleDotsIcon size={32} />}
              title="Start a conversation"
              contents={
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "What's the weather in Paris?",
                    "What timezone am I in?",
                    "Calculate 5000 * 3",
                    "Remind me in 5 minutes to take a break"
                  ].map((prompt) => (
                    <Button
                      key={prompt}
                      variant="outline"
                      size="sm"
                      disabled={isStreaming}
                      onClick={() => {
                        sendMessage({
                          role: "user",
                          parts: [{ type: "text", text: prompt }]
                        });
                      }}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              }
            />
          )}

          {messages.map((message: UIMessage, index: number) => {
            const isUser = message.role === "user";
            const isLastAssistant =
              message.role === "assistant" && index === messages.length - 1;

            return (
              <div key={message.id} className="space-y-2">
                {showDebug && (
                  <pre className="text-[11px] text-kumo-subtle bg-kumo-control rounded-lg p-3 overflow-auto max-h-64">
                    {JSON.stringify(message, null, 2)}
                  </pre>
                )}

                {/* Tool parts */}
                {message.parts.filter(isToolUIPart).map((part) => (
                  <ToolPartView
                    key={part.toolCallId}
                    part={part}
                    addToolApprovalResponse={addToolApprovalResponse}
                    outreachState={outreachState}
                    setOutreachState={setOutreachState}
                    onOutreachDecision={handleOutreachDecision}
                    isStreaming={isStreaming}
                  />
                ))}

                {/* Reasoning parts */}
                {message.parts
                  .filter(
                    (part) =>
                      part.type === "reasoning" &&
                      (part as { text?: string }).text?.trim()
                  )
                  .map((part, i) => {
                    const reasoning = part as {
                      type: "reasoning";
                      text: string;
                      state?: "streaming" | "done";
                    };
                    const isDone = reasoning.state === "done" || !isStreaming;
                    return (
                      <div key={i} className="flex justify-start">
                        <details className="max-w-[85%] w-full" open={!isDone}>
                          <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-sm select-none">
                            <BrainIcon size={14} className="text-purple-400" />
                            <span className="font-medium text-kumo-default">
                              Reasoning
                            </span>
                            {isDone ? (
                              <span className="text-xs text-kumo-success">
                                Complete
                              </span>
                            ) : (
                              <span className="text-xs text-kumo-brand">
                                Thinking...
                              </span>
                            )}
                            <CaretDownIcon
                              size={14}
                              className="ml-auto text-kumo-inactive"
                            />
                          </summary>
                          <pre className="mt-2 px-3 py-2 rounded-lg bg-kumo-control text-xs text-kumo-default whitespace-pre-wrap overflow-auto max-h-64">
                            {reasoning.text}
                          </pre>
                        </details>
                      </div>
                    );
                  })}

                {/* Image parts */}
                {message.parts
                  .filter(
                    (part): part is Extract<typeof part, { type: "file" }> =>
                      part.type === "file" &&
                      (part as { mediaType?: string }).mediaType?.startsWith(
                        "image/"
                      ) === true
                  )
                  .map((part, i) => (
                    <div
                      key={`file-${i}`}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <img
                        src={part.url}
                        alt="Attachment"
                        className="max-h-64 rounded-xl border border-kumo-line object-contain"
                      />
                    </div>
                  ))}

                {/* Text parts */}
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part, i) => {
                    const text = (part as { type: "text"; text: string }).text;
                    if (!text) return null;

                    if (isUser) {
                      return (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed">
                            {text}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={i} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
                          <Streamdown
                            className="sd-theme rounded-2xl rounded-bl-md p-3"
                            plugins={{ code }}
                            controls={false}
                            isAnimating={isLastAssistant && isStreaming}
                          >
                            {text}
                          </Streamdown>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-kumo-line bg-kumo-base">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="max-w-3xl mx-auto px-5 py-4"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {attachments.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative group rounded-lg border border-kumo-line bg-kumo-control overflow-hidden"
                >
                  <img
                    src={att.preview}
                    alt={att.file.name}
                    className="h-16 w-16 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-kumo-contrast/80 text-kumo-inverse p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${att.file.name}`}
                  >
                    <XIcon size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-kumo-ring focus-within:border-transparent transition-shadow">
            <Button
              type="button"
              variant="ghost"
              shape="square"
              aria-label="Attach images"
              icon={<PaperclipIcon size={18} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={!connected || isStreaming}
              className="mb-0.5"
            />
            <InputArea
              ref={textareaRef}
              value={input}
              onValueChange={setInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onPaste={handlePaste}
              placeholder={
                attachments.length > 0
                  ? "Add a message or send images..."
                  : "Send a message..."
              }
              disabled={!connected || isStreaming}
              rows={1}
              className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
            />
            {isStreaming ? (
              <Button
                type="button"
                variant="secondary"
                shape="square"
                aria-label="Stop generation"
                icon={<StopIcon size={18} />}
                onClick={stop}
                className="mb-0.5"
              />
            ) : (
              <Button
                type="submit"
                variant="primary"
                shape="square"
                aria-label="Send message"
                disabled={
                  (!input.trim() && attachments.length === 0) || !connected
                }
                icon={<PaperPlaneRightIcon size={18} />}
                className="mb-0.5"
              />
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive">
            Loading...
          </div>
        }
      >
        <Chat />
      </Suspense>
    </Toasty>
  );
}
