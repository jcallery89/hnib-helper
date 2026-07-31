// Generates wp/boys-major-ballot-form.json - a ready-to-import Gravity Forms
// form for the Boys Major Showcase coaches ballot, with every player dropdown
// wired to GP Populate Anything reading the gf_boysmajor_rosters table that
// wp/hnib-ballot-sync.php keeps current.
//
// Field property sets are modeled on the working Sophomore All-Star Ballot
// export (GF 2.10.4) so the import lands cleanly. Regenerate with:
//   node wp/generate-form.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TABLE = "gf_boysmajor_rosters";
const FORM_ID = 1; // remapped by Gravity Forms on import

// Deterministic stand-ins for the editor-generated ids in the sample export.
const layoutGroupId = (n) => n.toString(16).padStart(8, "0");
let uuidCounter = 1782590000000;
const uuid = () => uuidCounter++;

const common = {
  is_payment: false,
  duplicatable: true,
  repeatable: true,
  adminLabel: "",
  errorMessage: "",
  visibility: "visible",
  inputs: null,
  allowsPrepopulate: false,
  inputMask: false,
  inputMaskValue: "",
  inputMaskIsCustom: false,
  maxLength: "",
  labelPlacement: "",
  descriptionPlacement: "",
  subLabelPlacement: "",
  cssClass: "",
  inputName: "",
  noDuplicates: false,
  defaultValue: "",
  conditionalLogic: "",
  productField: "",
  layoutGridColumnSpan: 12,
  enableEnhancedUI: 0,
  multipleFiles: false,
  maxFiles: "",
  calculationFormula: "",
  calculationRounding: "",
  enableCalculation: "",
  disableQuantity: false,
  displayAllCategories: false,
  useRichTextEditor: false,
  errors: [],
  fields: "",
  displayOnly: "",
  formId: FORM_ID,
  enableAutocomplete: false,
  autocompleteAttribute: "",
};

let nextId = 1;
let groupCounter = 1;

function textField(label, { required = false, description = "" } = {}) {
  return {
    ...common,
    type: "text",
    id: nextId++,
    label,
    isRequired: required,
    size: "large",
    description,
    placeholder: "",
    choices: "",
    enablePasswordInput: "",
    layoutGroupId: layoutGroupId(groupCounter++),
  };
}

function textareaField(label, { description = "" } = {}) {
  return {
    ...common,
    type: "textarea",
    id: nextId++,
    label,
    isRequired: false,
    size: "large",
    description,
    descriptionPlacement: "above",
    placeholder: "",
    choices: "",
    maxLength: "",
    layoutGroupId: layoutGroupId(groupCounter++),
  };
}

function sectionField(label, description) {
  return {
    ...common,
    type: "section",
    id: nextId++,
    label,
    isRequired: false,
    size: "medium",
    description,
    placeholder: "",
    choices: "",
    displayOnly: true,
    layoutGroupId: layoutGroupId(groupCounter++),
  };
}

// A GPPA-populated select. The static `choices` are only a fallback shown if
// the GP Populate Anything plugin were missing; GPPA replaces them at render.
function gppaSelect(label, placeholder, gppa) {
  return {
    ...common,
    type: "select",
    id: nextId++,
    label,
    isRequired: gppa.required ?? false,
    size: "medium",
    description: "",
    placeholder,
    choices: [{ text: "Populated automatically from live rosters", value: "", isSelected: false, price: "" }],
    enablePrice: "",
    checkboxLabel: "",
    enableEnhancedUI: false,
    layoutGroupId: layoutGroupId(groupCounter++),
    "gppa-choices-enabled": true,
    "gppa-choices-object-type": "database",
    "gppa-choices-primary-property": TABLE,
    "gppa-choices-ordering-property": gppa.orderBy,
    "gppa-choices-ordering-method": gppa.orderDir,
    "gppa-choices-filter-groups": gppa.filters ?? [],
    "gppa-choices-templates": gppa.templates,
    "gppa-choices-unique-results": true,
    "gppa-values-enabled": false,
    "gppa-values-object-type": "database",
    "gppa-values-primary-property": "",
    "gppa-values-ordering-property": "",
    "gppa-values-ordering-method": "asc",
    "gppa-values-filter-groups": [],
    "gppa-values-templates": [],
    "gppa-values-unique-results": true,
  };
}

const positionFilter = (pos) => [[{ property: "position", operator: "is", value: pos, uuid: uuid() }]];

const playerSelect = (label, pos, orderBy, orderDir) =>
  gppaSelect(label, label, {
    filters: positionFilter(pos),
    orderBy,
    orderDir,
    templates: { value: "player_key", label: "display" },
  });

const fields = [
  textField("Coach's Name", { required: true }),
  textField("Cell #", {
    required: true,
    description: "Please provide your cell # so we can reach out if we need any clarification.",
  }),
  gppaSelect("Team You Coached", "Team You Coached", {
    required: true,
    orderBy: "team_name",
    orderDir: "asc",
    templates: { value: "team_name", label: "team_name" },
  }),
  sectionField(
    "Forwards",
    "Rank up to 16 forwards. Rank 1 = best. Rank only players you have an opinion on; blanks are fine. " +
      "Stats in each list update automatically as games are played.",
  ),
  ...Array.from({ length: 16 }, (_, i) => playerSelect(`Forward Rank ${i + 1}`, "F", "points", "desc")),
  sectionField("Defense", "Rank up to 10 defensemen. Rank 1 = best. Ranks 9 and 10 are optional."),
  ...Array.from({ length: 10 }, (_, i) =>
    playerSelect(`Defense Rank ${i + 1}${i >= 8 ? " (optional)" : ""}`, "D", "points", "desc"),
  ),
  sectionField("Goaltenders", "Rank up to 3 goaltenders. Rank 1 = best."),
  ...Array.from({ length: 3 }, (_, i) => playerSelect(`Goalie Rank ${i + 1}`, "G", "svpct", "desc")),
  textareaField("Important Notes", {
    description:
      "Injuries, position changes, or players you would take with an asterisk. " +
      "Anything the directors should know before the final roster is set.",
  }),
];

const form = {
  title: "Boys Major Showcase Coaches Ballot 2026",
  description: "",
  labelPlacement: "top_label",
  descriptionPlacement: "below",
  button: {
    type: "text",
    text: "Submit Ballot",
    imageUrl: "",
    conditionalLogic: null,
    width: "auto",
    location: "bottom",
    layoutGridColumnSpan: 12,
    id: "submit",
  },
  fields,
  version: "2.10.4",
  markupVersion: 2,
  nextFieldId: nextId,
  useCurrentUserAsAuthor: true,
  postContentTemplateEnabled: false,
  postTitleTemplateEnabled: false,
  postTitleTemplate: "",
  postContentTemplate: "",
  lastPageButton: null,
  pagination: null,
  firstPageCssClass: null,
  subLabelPlacement: "above",
  validationSummary: "1",
  requiredIndicator: "text",
  customRequiredIndicator: "(Required)",
  cssClass: "",
  save: { enabled: false, button: { type: "link", text: "Save and Continue Later" } },
  limitEntries: false,
  limitEntriesCount: "",
  limitEntriesPeriod: "",
  limitEntriesMessage: "",
  requireLogin: false,
  requireLoginMessage: "",
  scheduleForm: false,
  scheduleStart: "",
  scheduleStartHour: "",
  scheduleStartMinute: "",
  scheduleStartAmpm: "",
  scheduleEnd: "",
  scheduleEndHour: "",
  scheduleEndMinute: "",
  scheduleEndAmpm: "",
  schedulePendingMessage: "",
  scheduleMessage: "",
  enableHoneypot: true,
  honeypotAction: "spam",
  enableAnimation: false,
  id: FORM_ID,
  validationPlacement: "below",
  saveButtonText: "Save and Continue Later",
  deprecated: "",
  saveEnabled: "",
  confirmations: [
    {
      id: "bm2026confirm01",
      name: "Default Confirmation",
      isDefault: true,
      type: "message",
      message:
        "Thank you for submitting your ballot. If you have any changes, please text Jamie Callery at 978-873-0774.",
      url: "",
      pageId: "",
      queryString: "",
      event: "",
      disableAutoformat: false,
      conditionalLogic: [],
      page: "",
    },
  ],
  notifications: [
    {
      id: "bm2026notify01",
      isActive: true,
      to: "{admin_email}",
      name: "Admin Notification",
      event: "form_submission",
      toType: "email",
      subject: "Boys Major Showcase Coaches Ballot",
      message: "{all_fields}",
      service: "wordpress",
      toEmail: "{admin_email}",
      routing: null,
      fromName: "",
      from: "{admin_email}",
      replyTo: "",
      bcc: "",
      disableAutoformat: false,
      notification_conditional_logic_object: "",
      notification_conditional_logic: "0",
      conditionalLogic: null,
      cc: "",
      enableAttachments: false,
    },
  ],
};

const out = { 0: form, version: "3.0.0" };
const path = join(dirname(fileURLToPath(import.meta.url)), "boys-major-ballot-form.json");
writeFileSync(path, JSON.stringify(out));
console.log(`Wrote ${path}: ${fields.length} fields, nextFieldId ${nextId}`);
