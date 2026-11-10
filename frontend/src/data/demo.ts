/**
 * Demo data: the exact sample content from verity-prototype.html.
 * Used when VITE_MODE_DATA=demo, and mirrored by backend/app/seed.py for the API.
 */
import type { AppSummary, ChangedFile, Module, PullRequest, RegressionCase, Status, StaticCycleRow, Suggestion, User, UserKey, AdoRepo, CaseType, Priority, Source, ResultStatus } from "@/types";

export const FLOW: Status[] = [
  "Draft",
  "Tests Generated",
  "Assigned",
  "In Testing",
  "Submitted",
  "AI Reviewed",
  "Approved for UAT"
];

export const USERS: Record<UserKey, User> = {
  dev: {
    name: "Daniel Okafor",
    ini: "DO",
    role: "Senior Developer"
  },
  tester: {
    name: "Priya Shah",
    ini: "PS",
    role: "Tester"
  },
  admin: {
    name: "Sam Patel",
    ini: "SP",
    role: "Admin"
  },
  ai: {
    name: "Verity AI",
    ini: "AI",
    role: ""
  },
  sys: {
    name: "Verity",
    ini: "VY",
    role: ""
  }
};

export const MODS: Module[] = [
  {
    id: "settle",
    name: "Refund settlement logic",
    risk: "High",
    desc: "New partial refund path changes how the settled balance is calculated. Touches the ledger table and migration."
  },
  {
    id: "valid",
    name: "Validation and guards",
    risk: "High",
    desc: "Amount limits, rounding to cents and the new closed-claim guard returning 409 CLAIM_CLOSED."
  },
  {
    id: "conc",
    name: "Concurrency",
    risk: "Medium",
    desc: "Settlement row is locked for update during a refund to stop two refunds racing."
  },
  {
    id: "bill",
    name: "Billing integration",
    risk: "Medium",
    desc: "RefundIssued event published to the billing queue. No commit notes on this change."
  },
  {
    id: "ui",
    name: "Settlement UI",
    risk: "Low",
    desc: "Refunded and Remaining rows added to the settlement summary and payment history."
  }
];

/** Change module id -> regression suite module name, used when promoting a case. */
export const MODREG: Record<string, string> = {
  settle: "Settlement",
  valid: "Claim status",
  conc: "Settlement",
  bill: "Billing",
  ui: "Claim history"
};

export const FILES: ChangedFile[] = [
  {
    status: "A",
    path: "db/migrations/0147_partial_refund.sql",
    added: 34,
    removed: 0
  },
  {
    status: "M",
    path: "src/Claims.Settlement/RefundService.cs",
    added: 142,
    removed: 18
  },
  {
    status: "A",
    path: "src/Claims.Settlement/RefundLedger.cs",
    added: 96,
    removed: 0
  },
  {
    status: "M",
    path: "src/Claims.Settlement/RefundValidator.cs",
    added: 61,
    removed: 7
  },
  {
    status: "A",
    path: "src/Claims.Core/ClaimStatusGuard.cs",
    added: 38,
    removed: 0
  },
  {
    status: "M",
    path: "src/Claims.Api/RefundController.cs",
    added: 54,
    removed: 12
  },
  {
    status: "A",
    path: "src/Claims.Billing/RefundEventPublisher.cs",
    added: 47,
    removed: 0
  },
  {
    status: "M",
    path: "src/Claims.Data/SettlementRepository.cs",
    added: 22,
    removed: 4
  },
  {
    status: "M",
    path: "web/src/settlement/SettlementSummary.tsx",
    added: 73,
    removed: 21
  },
  {
    status: "M",
    path: "web/src/claims/ClaimHistory.tsx",
    added: 18,
    removed: 6
  },
  {
    status: "M",
    path: "web/src/settlement/settlement.css",
    added: 12,
    removed: 2
  },
  {
    status: "A",
    path: "tests/Claims.Settlement.Tests/RefundServiceTests.cs",
    added: 188,
    removed: 0
  },
  {
    status: "A",
    path: "tests/Claims.Settlement.Tests/RefundValidatorTests.cs",
    added: 121,
    removed: 0
  },
  {
    status: "M",
    path: "src/Claims.Api/Permissions.cs",
    added: 6,
    removed: 0
  },
  {
    status: "M",
    path: "src/Claims.Billing/BillingQueueClient.cs",
    added: 9,
    removed: 3
  },
  {
    status: "M",
    path: "src/Claims.Core/Claim.cs",
    added: 14,
    removed: 2
  },
  {
    status: "M",
    path: "src/Claims.Data/ClaimsDbContext.cs",
    added: 11,
    removed: 0
  },
  {
    status: "M",
    path: "web/src/api/refunds.ts",
    added: 44,
    removed: 0
  },
  {
    status: "M",
    path: "docs/refunds.md",
    added: 30,
    removed: 0
  }
];

export const PRS: PullRequest[] = [
  {
    num: 482,
    title: "Add partial refund support to claim settlement",
    author: "Marcus Lee",
    branch: "feature/partial-refunds",
    created: "Oct 26",
    items: [
      "AB#1290",
      "AB#1294"
    ],
    inCycle: false,
    commits: [
      {
        hash: "a3f91c2",
        message: "Add PartialRefund entity and ledger table",
        author: "Marcus Lee",
        aiNote: "Adds a partial_refund table keyed by claim_id. Settlement balance is now derived as settled amount minus the sum of refunds.",
        files: 4
      },
      {
        hash: "7be04d1",
        message: "Validate refund amount against settled balance",
        author: "Anika Rao",
        aiNote: "Rejects amounts of zero or less and amounts above the remaining balance. Rounds to 2 decimal places.",
        files: 3
      },
      {
        hash: "c19e8a7",
        message: "Block refunds on closed or archived claims",
        author: "Anika Rao",
        aiNote: "Adds ClaimStatusGuard. Returns 409 with code CLAIM_CLOSED.",
        files: 2
      },
      {
        hash: "4d2f6b0",
        message: "Publish RefundIssued event to billing queue",
        author: "Marcus Lee",
        aiNote: "",
        files: 3
      },
      {
        hash: "e88a13f",
        message: "Settlement summary: show refunded and remaining amounts",
        author: "Anika Rao",
        aiNote: "UI only. New Refunded and Remaining rows on SettlementSummary.",
        files: 5
      },
      {
        hash: "91c0d5e",
        message: "Add row lock to prevent concurrent refund race",
        author: "Marcus Lee",
        aiNote: "Locks the settlement row for update inside the refund transaction.",
        files: 2
      }
    ]
  },
  {
    num: 490,
    title: "Claims search: filter by policy number",
    author: "Anika Rao",
    branch: "feature/search-policy-no",
    created: "Oct 29",
    items: [
      "AB#1311"
    ],
    inCycle: false,
    commits: [
      {
        hash: "5b7a0e9",
        message: "Add policy number to search index",
        author: "Anika Rao",
        aiNote: "Adds policy_no to the claims search index and backfills existing rows.",
        files: 3
      },
      {
        hash: "f02c4d1",
        message: "Search UI: policy number filter chip",
        author: "Anika Rao",
        aiNote: "New filter chip in ClaimsSearchBar. Accepts partial match of 4+ characters.",
        files: 2
      },
      {
        hash: "8e1d3aa",
        message: "Tests for policy number search",
        author: "Anika Rao",
        aiNote: "",
        files: 2
      }
    ]
  },
  {
    num: 485,
    title: "Upgrade EF Core to 8.0.10",
    author: "Jordan Kim",
    branch: "chore/efcore-8010",
    created: "Oct 28",
    items: [
      "AB#1302"
    ],
    inCycle: false,
    commits: [
      {
        hash: "c7d93b4",
        message: "Bump EF Core packages to 8.0.10",
        author: "Jordan Kim",
        aiNote: "Package bump only. No migration changes.",
        files: 6
      },
      {
        hash: "2a6f8e0",
        message: "Fix obsolete query API warnings",
        author: "Jordan Kim",
        aiNote: "Replaces FromSql with FromSqlRaw in 3 repositories.",
        files: 3
      }
    ]
  },
  {
    num: 487,
    title: "Adjuster notes: support markdown",
    author: "Marcus Lee",
    branch: "feature/notes-markdown",
    created: "Oct 27",
    items: [
      "AB#1297"
    ],
    inCycle: true,
    commits: []
  },
  {
    num: 479,
    title: "Fix date filter on claims search",
    author: "Anika Rao",
    branch: "fix/search-date-tz",
    created: "Oct 24",
    items: [
      "AB#1281"
    ],
    inCycle: true,
    commits: []
  }
];

export interface CaseTemplate { id: string; title: string; type: CaseType; pri: Priority; file: string; src: Source; mod: string; pre: string; steps: string[]; exp: string }
/** The 14 cases the AI returns for PR #482 in demo mode. */
export const TPL: CaseTemplate[] = [
  {
    id: "TC-01",
    title: "Partial refund less than settled amount succeeds",
    type: "Functional",
    pri: "P1",
    file: "RefundService.cs",
    src: "diff",
    mod: "settle",
    pre: "Claim CLM-20931 settled at $1,200.00. User has Refund.Approve.",
    steps: [
      "Open claim CLM-20931",
      "Click Issue refund, enter $200.00 and a reason",
      "Submit"
    ],
    exp: "Refund saved. Remaining balance shows $1,000.00. Claim stays Settled."
  },
  {
    id: "TC-02",
    title: "Refund exceeding settled amount is rejected",
    type: "Negative",
    pri: "P1",
    file: "RefundValidator.cs",
    src: "diff",
    mod: "valid",
    pre: "Claim settled at $1,200.00 with no prior refunds.",
    steps: [
      "Click Issue refund",
      "Enter $1,250.00",
      "Submit"
    ],
    exp: `Inline error “Refund cannot exceed the remaining balance of $1,200.00”. Nothing saved.`
  },
  {
    id: "TC-03",
    title: "Refund on closed claim shows error",
    type: "Negative",
    pri: "P1",
    file: "ClaimStatusGuard.cs",
    src: "notes",
    mod: "valid",
    pre: "Claim CLM-19877 has status Closed.",
    steps: [
      "Open the closed claim",
      "Try Issue refund",
      "Call POST /refunds directly"
    ],
    exp: "Issue refund is disabled with tooltip. API returns 409 CLAIM_CLOSED."
  },
  {
    id: "TC-04",
    title: "Refund equal to remaining balance fully refunds the claim",
    type: "Edge case",
    pri: "P1",
    file: "RefundService.cs",
    src: "diff",
    mod: "settle",
    pre: "Claim settled at $1,200.00.",
    steps: [
      "Issue refund of $1,200.00",
      "Submit"
    ],
    exp: "Remaining shows $0.00. Status changes to Fully refunded."
  },
  {
    id: "TC-05",
    title: "Cumulative partial refunds cannot exceed settled total",
    type: "Edge case",
    pri: "P1",
    file: "RefundLedger.cs",
    src: "diff",
    mod: "settle",
    pre: "Claim settled at $1,200.00 with a prior refund of $900.00.",
    steps: [
      "Issue refund of $400.00",
      "Submit"
    ],
    exp: "Rejected. Error shows remaining balance $300.00."
  },
  {
    id: "TC-06",
    title: "Amount with more than 2 decimals is rounded to cents",
    type: "Edge case",
    pri: "P2",
    file: "RefundValidator.cs",
    src: "notes",
    mod: "valid",
    pre: "Claim settled at $500.00.",
    steps: [
      "Enter 100.005",
      "Submit"
    ],
    exp: "Saved as $100.01 and shown that way in the confirmation."
  },
  {
    id: "TC-07",
    title: "Zero or negative refund amount is rejected",
    type: "Negative",
    pri: "P2",
    file: "RefundValidator.cs",
    src: "diff",
    mod: "valid",
    pre: "Any settled claim.",
    steps: [
      "Enter 0 and submit",
      "Enter −50 and submit"
    ],
    exp: `Both rejected with “Enter an amount greater than $0.00”.`
  },
  {
    id: "TC-08",
    title: "Refund reason is required and written to the audit log",
    type: "Functional",
    pri: "P2",
    file: "RefundController.cs",
    src: "diff",
    mod: "settle",
    pre: "Settled claim. Audit log viewer access.",
    steps: [
      "Submit with an empty reason",
      "Submit with a reason",
      "Open the audit log"
    ],
    exp: "First is blocked. Second is saved with reason, user and time in the audit log."
  },
  {
    id: "TC-09",
    title: "Settlement summary shows refunded and remaining amounts",
    type: "Functional",
    pri: "P1",
    file: "SettlementSummary.tsx",
    src: "notes",
    mod: "ui",
    pre: "Claim with one $200.00 refund on $1,200.00.",
    steps: [
      "Open the claim settlement tab"
    ],
    exp: "Rows read Settled $1,200.00, Refunded $200.00, Remaining $1,000.00."
  },
  {
    id: "TC-10",
    title: "User without Refund.Approve cannot issue a refund",
    type: "Negative",
    pri: "P1",
    file: "RefundController.cs",
    src: "diff",
    mod: "valid",
    pre: "Signed in as an adjuster without Refund.Approve.",
    steps: [
      "Open a settled claim",
      "Look for Issue refund",
      "Call POST /refunds with the same token"
    ],
    exp: "Issue refund is hidden. API returns 403."
  },
  {
    id: "TC-11",
    title: "RefundIssued event reaches the Billing Service queue",
    type: "Functional",
    pri: "P2",
    file: "RefundEventPublisher.cs",
    src: "diff",
    mod: "bill",
    pre: "Billing queue reachable in the test environment.",
    steps: [
      "Issue a $50.00 refund",
      "Inspect the billing-refunds queue"
    ],
    exp: "One RefundIssued message with claim ID, amount and refund ID."
  },
  {
    id: "TC-12",
    title: "Concurrent refunds on the same claim are serialized",
    type: "Edge case",
    pri: "P1",
    file: "SettlementRepository.cs",
    src: "notes",
    mod: "conc",
    pre: "Claim settled at $1,200.00. Two sessions open.",
    steps: [
      "Prepare $700.00 in both sessions",
      "Submit both at the same time"
    ],
    exp: "One succeeds. The other is rejected for exceeding the remaining balance."
  },
  {
    id: "TC-13",
    title: "Full settlement without refund still completes",
    type: "Regression",
    pri: "P1",
    file: "Settlement module",
    src: "reg",
    mod: "settle",
    pre: "New claim ready for settlement. Linked to REG-118.",
    steps: [
      "Settle the claim for the full amount",
      "Confirm no refund rows exist"
    ],
    exp: "Status Settled, payment sent, no refund rows created."
  },
  {
    id: "TC-14",
    title: "Payment history lists refunds in date order",
    type: "Regression",
    pri: "P3",
    file: "ClaimHistory.tsx",
    src: "reg",
    mod: "ui",
    pre: "Claim with a payment and two refunds. Linked to REG-207.",
    steps: [
      "Open the Payment history tab"
    ],
    exp: "Entries listed newest first with type labels Payment and Refund."
  }
];

/** Sample tester results used by "Prototype: fill sample results". */
export const SAMPLE: Record<string, { status: Exclude<ResultStatus, "">; actual: string; evidence: string[]; bug: string }> = {
  "TC-01": {
    status: "pass",
    actual: "Refund saved. Remaining $1,000.00. Status Settled.",
    evidence: [
      "tc01-refund-saved.png"
    ],
    bug: ""
  },
  "TC-02": {
    status: "pass",
    actual: "Error shown with $1,200.00. No refund row created.",
    evidence: [
      "tc02-inline-error.png"
    ],
    bug: ""
  },
  "TC-03": {
    status: "pass",
    actual: "Disabled with tooltip. API returned 409 CLAIM_CLOSED.",
    evidence: [
      "tc03-disabled.png",
      "tc03-api-409.log"
    ],
    bug: ""
  },
  "TC-04": {
    status: "pass",
    actual: "Remaining $0.00, status Fully refunded.",
    evidence: [
      "tc04-fully-refunded.png"
    ],
    bug: ""
  },
  "TC-05": {
    status: "pass",
    actual: "Rejected as expected.",
    evidence: [],
    bug: ""
  },
  "TC-06": {
    status: "fail",
    actual: "Saved as $100.00. Value is truncated, not rounded.",
    evidence: [
      "tc06-confirmation-100.00.png",
      "refund-api.log"
    ],
    bug: "AB#1318"
  },
  "TC-07": {
    status: "pass",
    actual: "Both rejected with the expected message.",
    evidence: [
      "tc07-zero.png"
    ],
    bug: ""
  },
  "TC-08": {
    status: "pass",
    actual: "Blocked, then saved. Audit entry present with reason.",
    evidence: [
      "tc08-audit.png"
    ],
    bug: ""
  },
  "TC-09": {
    status: "pass",
    actual: "Rows correct after reload. Remaining showed $0.00 for a moment first.",
    evidence: [
      "tc09-summary.png"
    ],
    bug: ""
  },
  "TC-10": {
    status: "pass",
    actual: "Issue refund button is not shown. API call returned 403 Forbidden.",
    evidence: [
      "tc10-no-button.png"
    ],
    bug: ""
  },
  "TC-11": {
    status: "blocked",
    actual: "billing-refunds queue not reachable from the QA environment.",
    evidence: [],
    bug: ""
  },
  "TC-12": {
    status: "pass",
    actual: "First request succeeded, second rejected with remaining $500.00.",
    evidence: [
      "tc12-concurrency.log"
    ],
    bug: ""
  },
  "TC-13": {
    status: "pass",
    actual: "Settled and paid. No refund rows.",
    evidence: [
      "tc13-settled.png"
    ],
    bug: ""
  },
  "TC-14": {
    status: "pass",
    actual: "Newest first, labels correct.",
    evidence: [
      "tc14-history.png"
    ],
    bug: ""
  }
};

export const SUGG: Suggestion[] = [
  {
    reg: "REG-142",
    title: "Settlement totals recalculate after an adjustment",
    reason: "Uses the settled balance calculation changed in a3f91c2.",
    last: "Oct 21 · Pass",
    mod: "settle",
    pri: "P1",
    pre: "Settled claim with one adjustment.",
    steps: [
      "Add a $100.00 adjustment",
      "Open the settlement summary"
    ],
    exp: "Totals include the adjustment and remaining balance is correct."
  },
  {
    reg: "REG-163",
    title: "Billing events retry after a queue outage",
    reason: "RefundEventPublisher uses the same BillingQueueClient.",
    last: "Oct 14 · Pass",
    mod: "bill",
    pri: "P2",
    pre: "Billing queue can be paused in the test environment.",
    steps: [
      "Pause the queue",
      "Issue a refund",
      "Resume the queue"
    ],
    exp: "Event is delivered once after the queue resumes."
  },
  {
    reg: "REG-201",
    title: "Closed claims are read-only for adjusters",
    reason: "ClaimStatusGuard adds a new closed-claim check on the same status.",
    last: "Oct 27 · Pass",
    mod: "valid",
    pri: "P1",
    pre: "Closed claim.",
    steps: [
      "Open the claim as an adjuster",
      "Try to edit any field"
    ],
    exp: "All fields are read-only."
  }
];

/** AI explanations for failed / blocked cases in demo mode. */
export const AIX: Record<string, string> = {
  "TC-06": "Commit 7be04d1 says amounts round to 2 decimal places, so this is a real defect, not a test error. Impact is limited to amounts below one cent. Approving is reasonable if the client is told it is a known issue.",
  "TC-11": "This is the only case covering the billing event, and commit 4d2f6b0 has no AI notes. Billing could miss refunds without anyone noticing. Verify in staging before UAT or accept the risk explicitly."
};

export const STATIC_CYCLES: StaticCycleRow[] = [
  {
    title: "Fix date filter on claims search",
    sub: "2 commits · 8 test cases",
    status: "In Testing",
    pr: "PR #479",
    author: "Anika Rao",
    tester: "Tomás Rivera",
    pass: 5,
    fail: 0,
    blocked: 0,
    total: 8,
    score: null,
    updated: "2 h ago"
  },
  {
    title: "Adjuster notes: support markdown",
    sub: "4 commits · 11 test cases",
    status: "Tests Generated",
    pr: "PR #487",
    author: "Marcus Lee",
    tester: "Unassigned",
    pass: 0,
    fail: 0,
    blocked: 0,
    total: 11,
    score: null,
    updated: "Yesterday"
  },
  {
    title: "Release 2026.10.2",
    sub: "5 PRs · 38 test cases",
    status: "Changes Requested",
    pr: "Release",
    author: "Daniel Okafor",
    tester: "Priya Shah",
    pass: 27,
    fail: 3,
    blocked: 1,
    total: 38,
    score: 64,
    updated: "Oct 28"
  },
  {
    title: "Claim attachments: show virus scan status",
    sub: "3 commits · 9 test cases",
    status: "Approved for UAT",
    pr: "PR #471",
    author: "Anika Rao",
    tester: "Tomás Rivera",
    pass: 9,
    fail: 0,
    blocked: 0,
    total: 9,
    score: 91,
    updated: "Oct 27"
  },
  {
    title: "Claims export: CSV format v2",
    sub: "5 commits · 12 test cases",
    status: "Approved for UAT",
    pr: "PR #468",
    author: "Jordan Kim",
    tester: "Priya Shah",
    pass: 12,
    fail: 0,
    blocked: 0,
    total: 12,
    score: 88,
    updated: "Oct 21"
  }
];

export const ADO: Record<string, Record<string, AdoRepo[]>> = {
  "contoso-health": {
    Claims: [
      {
        name: "claims-intake-service",
        updated: "Updated 2 days ago",
        branch: "main"
      },
      {
        name: "claims-portal-web",
        updated: "Updated 3 hours ago",
        branch: "main"
      },
      {
        name: "adjuster-workbench",
        updated: "Updated yesterday",
        branch: "main"
      },
      {
        name: "claims-rules-engine",
        updated: "Updated 6 days ago",
        branch: "develop"
      },
      {
        name: "claims-docs-ocr",
        updated: "Updated 3 weeks ago",
        branch: "main"
      }
    ],
    Member: [
      {
        name: "member-mobile-api",
        updated: "Updated today",
        branch: "main"
      },
      {
        name: "eligibility-engine",
        updated: "Updated 4 days ago",
        branch: "main"
      },
      {
        name: "member-preferences-svc",
        updated: "Updated 2 weeks ago",
        branch: "main"
      }
    ],
    Finance: [
      {
        name: "billing-service",
        updated: "Updated today",
        branch: "main"
      },
      {
        name: "payments-gateway",
        updated: "Updated 5 days ago",
        branch: "main"
      },
      {
        name: "ledger-sync",
        updated: "Updated a month ago",
        branch: "main"
      }
    ],
    Provider: [
      {
        name: "provider-directory",
        updated: "Updated 3 days ago",
        branch: "main"
      },
      {
        name: "credentialing-api",
        updated: "Updated 9 days ago",
        branch: "develop"
      }
    ]
  },
  "contoso-labs": {
    Prototypes: [
      {
        name: "claims-chatbot-poc",
        updated: "Updated 2 weeks ago",
        branch: "main"
      },
      {
        name: "ocr-experiments",
        updated: "Updated a month ago",
        branch: "main"
      }
    ]
  }
};

export const INITIAL_APPS: AppSummary[] = [
  {
    rate: 94,
    tag: null,
    id: "claims",
    name: "Claims Portal",
    ini: "CP",
    path: "contoso-health / Claims / claims-portal-web",
    open: 3,
    reg: 214,
    last: "Oct 27, 2026"
  },
  {
    rate: 91,
    tag: {
      label: "In testing",
      cls: "p-nr"
    },
    id: "member-api",
    name: "Member Mobile API",
    ini: "MM",
    path: "contoso-health / Member / member-mobile-api",
    open: 2,
    reg: 168,
    last: "Oct 22, 2026"
  },
  {
    rate: 97,
    tag: {
      label: "In testing",
      cls: "p-nr"
    },
    id: "billing",
    name: "Billing Service",
    ini: "BS",
    path: "contoso-health / Finance / billing-service",
    open: 1,
    reg: 302,
    last: "Oct 29, 2026"
  },
  {
    rate: 86,
    tag: {
      label: "2 cycles blocked",
      cls: "p-blk"
    },
    id: "elig",
    name: "Eligibility Engine",
    ini: "EE",
    path: "contoso-health / Member / eligibility-engine",
    open: 4,
    reg: 251,
    last: "Oct 20, 2026"
  },
  {
    rate: 92,
    tag: {
      label: "In testing",
      cls: "p-nr"
    },
    id: "adj",
    name: "Adjuster Workbench",
    ini: "AW",
    path: "contoso-health / Claims / adjuster-workbench",
    open: 1,
    reg: 143,
    last: "Oct 9, 2026"
  },
  {
    rate: 89,
    tag: {
      label: "No open cycles",
      cls: "p-nr"
    },
    id: "prov",
    name: "Provider Directory",
    ini: "PD",
    path: "contoso-health / Provider / provider-directory",
    open: 0,
    reg: 88,
    last: "Oct 14, 2026"
  }
];

export const INITIAL_REGRESSION: RegressionCase[] = [
  {
    id: "REG-118",
    title: "Full settlement without refund completes",
    mod: "Settlement",
    pri: "P1",
    last: "Oct 27",
    res: "Pass",
    hist: "PPPPPPPPPP",
    src: "PR #402",
    dup: "REG-131",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-131",
    title: "Settle claim end to end for full amount",
    mod: "Settlement",
    pri: "P1",
    last: "Oct 27",
    res: "Pass",
    hist: "NNNPPPPPPP",
    src: "Release 2026.09.1",
    dup: "REG-118",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-142",
    title: "Settlement totals recalculate after an adjustment",
    mod: "Settlement",
    pri: "P1",
    last: "Oct 21",
    res: "Pass",
    hist: "PPPFPPPPPP",
    src: "PR #377",
    dup: "",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-163",
    title: "Billing events retry after a queue outage",
    mod: "Billing",
    pri: "P2",
    last: "Oct 14",
    res: "Pass",
    hist: "PPBPPBPPPP",
    src: "PR #351",
    dup: "",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-170",
    title: "Settlement letter shows correct payee",
    mod: "Settlement",
    pri: "P2",
    last: "Oct 27",
    res: "Pass",
    hist: "PPPPPPPPPP",
    src: "PR #355",
    dup: "",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-188",
    title: "Overpayment recovery creates a receivable",
    mod: "Billing",
    pri: "P1",
    last: "Oct 27",
    res: "Fail",
    hist: "PPPPPPPPFF",
    src: "PR #389",
    dup: "",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-201",
    title: "Closed claims are read-only for adjusters",
    mod: "Claim status",
    pri: "P1",
    last: "Oct 27",
    res: "Pass",
    hist: "PPPPPPPPPP",
    src: "PR #410",
    dup: "REG-209",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-207",
    title: "Payment history lists entries in date order",
    mod: "Claim history",
    pri: "P3",
    last: "Oct 27",
    res: "Pass",
    hist: "PPPPPPPPPP",
    src: "PR #418",
    dup: "",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-209",
    title: "Adjuster cannot edit a closed claim",
    mod: "Claim status",
    pri: "P2",
    last: "Oct 9",
    res: "Pass",
    hist: "NNNNNNPPPP",
    src: "PR #431",
    dup: "REG-201",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-212",
    title: "Settlement export includes adjustments",
    mod: "Settlement",
    pri: "P3",
    last: "Sep 30",
    res: "Not run",
    hist: "PPPPPPPNNN",
    src: "PR #440",
    dup: "",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-213",
    title: "Billing reconciliation report balances to zero",
    mod: "Billing",
    pri: "P2",
    last: "Oct 27",
    res: "Blocked",
    hist: "PPPPPPPPPB",
    src: "PR #451",
    dup: "",
    dupWhy: "",
    tags: []
  },
  {
    id: "REG-214",
    title: "Claim payment reversal posts to ledger",
    mod: "Settlement",
    pri: "P1",
    last: "Oct 27",
    res: "Pass",
    hist: "PPPPPPPPPP",
    src: "PR #468",
    dup: "",
    dupWhy: "",
    tags: []
  }
];
