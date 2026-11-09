/**
 * English dictionary. Must have exactly the same shape as `es.ts`
 * (enforced by the `Dictionary` type).
 */
import type { InspectionFrame, PortalProject, PortalReport, ServiceSpec } from "@/contracts/platform";
import type { ServicePage } from "@/content/service-pages";
import { PORTAL_PROJECTS, PORTAL_REPORTS } from "@/content/portal-demo";
import { INSPECTION_FRAMES } from "@/content/demo-data";
import { COMPATIBILITY } from "@/content/site";
import { SERVICE_SLUGS } from "./routes";
import type { Dictionary } from "./types";

/** dd/mm/yyyy -> mm/dd/yyyy for US-style dates in the demo data. */
const usDate = (d: string) => d.replace(/^(\d{2})\/(\d{2})\//, "$2/$1/");

const slug = (id: (typeof SERVICE_SLUGS)[number]["id"]) => SERVICE_SLUGS.find((s) => s.id === id)!.en;

/* ---------- Demo data ---------- */

const PROJECT_TEXT: Record<PortalProject["id"], Pick<PortalProject, "name" | "site" | "assetLabel" | "lastFlight">> = {
  wind: { name: "Los Cerros Wind Farm", site: "Oaxaca", assetLabel: "Turbines", lastFlight: "2 days ago" },
  line: { name: "North 230 kV Line", site: "Sonora", assetLabel: "Towers", lastFlight: "6 days ago" },
  solar: { name: "El Llano Solar Plant", site: "Coahuila", assetLabel: "Tables", lastFlight: "Yesterday" },
};

const projects: PortalProject[] = PORTAL_PROJECTS.map((p) => ({
  ...p,
  ...PROJECT_TEXT[p.id],
  assets: p.assets.map((a) => ({ ...a, lastInspection: usDate(a.lastInspection) })),
}));

const REPORT_TEXT: Record<string, Pick<PortalReport, "title" | "project">> = {
  r1: { title: "Quarterly blade inspection · Q4", project: "Los Cerros Wind Farm" },
  r2: { title: "Tower and insulator inspection", project: "North 230 kV Line" },
  r3: { title: "Module thermography · Sector A", project: "El Llano Solar Plant" },
  r4: { title: "Quarterly blade inspection · Q3", project: "Los Cerros Wind Farm" },
  r5: { title: "Stockpile volumetrics · October", project: "North Pit" },
};

const reports: PortalReport[] = PORTAL_REPORTS.map((r) => ({ ...r, ...REPORT_TEXT[r.id], date: usDate(r.date) }));

const FINDING_TEXT: Record<string, { label: string; component: string }> = {
  "f-1": { label: "Fractured insulator disc", component: "Suspension string · phase B" },
  "f-2": { label: "Corrosion on connection bolt", component: "Upper crossarm · node 3" },
  "f-3": { label: "Nest on crossarm", component: "Middle crossarm · right side" },
  "t-1": { label: "Hot spot on suspension clamp", component: "Clamp · phase A" },
  "t-2": { label: "Heating at conductor splice", component: "Conductor · phase C, span 0412–0413" },
};

const translateFrame = (f: InspectionFrame): InspectionFrame => ({
  ...f,
  assetLabel: "Tower T-0412 · 230 kV Line",
  findings: f.findings.map((x) => ({ ...x, ...FINDING_TEXT[x.id] })),
});

const frames = { zoom: translateFrame(INSPECTION_FRAMES.zoom), thermal: translateFrame(INSPECTION_FRAMES.thermal) };

/* ---------- Services ---------- */

const services: ServiceSpec[] = [
  {
    id: "dji_apps",
    index: "01",
    title: "Apps for DJI controllers",
    summary:
      "Custom apps installed on DJI remote controllers, built with DJI's official developer kit (Mobile SDK v5). They automate routes and captures so every flight delivers the same result, regardless of pilot experience.",
    points: ["Automated routes and captures", "Guided steps for the pilot", "Pre-flight checklists", "Photos organized by asset and date"],
    href: `/en/services/${slug("dji_apps")}`,
    cta: "Learn about this service",
  },
  {
    id: "platforms",
    index: "02",
    title: "Project management platforms",
    summary:
      "Your own web portal where your team, and your clients if you want, follow each project, review findings and download reports, without passing folders and emails around.",
    points: ["Projects, sites and assets on a map", "Finding review and approval", "Ready-to-download reports", "Role-based user permissions"],
    href: `/en/services/${slug("platforms")}`,
    cta: "Learn about this service",
  },
  {
    id: "web",
    index: "03",
    title: "Websites and web services",
    summary:
      "Corporate websites, forms, quote calculators and integrations with the tools you already use. We build what your operation needs to publish or automate on the web.",
    points: ["Corporate and product websites", "Online forms and quote calculators", "Integration with spreadsheets and existing systems", "Hosting and maintenance"],
    href: `/en/services/${slug("web")}`,
    cta: "Learn about this service",
  },
];

/* ---------- Service pages (SEO) ---------- */

const servicePages: ServicePage[] = [
  {
    slug: slug("dji_apps"),
    keyword: "DJI drone app development",
    metaTitle: "DJI Drone App Development · Custom Apps",
    metaDescription:
      "Custom apps for DJI controllers built with Mobile SDK v5: automated routes and captures, repeatable inspections and organized photos. Free assessment.",
    eyebrow: "Apps for DJI controllers",
    h1: "DJI drone app development tailored to your operation",
    intro:
      "We do DJI drone app development for apps that run on the remote controller, such as DJI RC Plus or RC Pro Enterprise, and turn your inspection process into a guided sequence. Every flight follows the same steps and delivers the same photos, regardless of each pilot's experience.",
    sections: [
      {
        h2: "What a custom DJI drone app does",
        bullets: [
          "Automated routes and captures: the drone follows the path and takes photos at the defined points.",
          "Guided steps for the pilot, with on-screen prompts showing what to do next.",
          "Pre-flight checklists so nothing is missed in the field.",
          "Photos organized by asset, date and component, ready for review.",
          "A control button so the pilot can stop the sequence at any time.",
        ],
      },
      {
        h2: "Built with DJI's official SDK",
        body: "We work with DJI Mobile SDK v5, DJI's official kit for building apps on its controllers. The app installs like any other and uses the drone's features: camera, gimbal, telemetry, routes and, on models that have it, the laser rangefinder.",
      },
      {
        h2: "Compatible DJI drones and controllers",
        bullets: [
          `${COMPATIBILITY.aircraft.join(", ")}.`,
          `Controllers: ${COMPATIBILITY.controllers.join(", ")}.`,
          "If your model is not listed, we confirm compatibility during the initial assessment.",
        ],
      },
      {
        h2: "How we build your app",
        bullets: [
          "Initial call to understand your operation, your drones and the result you need.",
          "Proposal with scope, timeline and cost, plus sample screens before any coding.",
          "Development in stages and field testing with your drones.",
          "Installation on your controllers, team training and post-delivery support.",
        ],
      },
    ],
    useCases: {
      h2: "Examples of drone inspection apps",
      items: [
        {
          title: "Wind turbine inspection",
          body: "Guided sequence across the four faces of each blade, with constant laser-measured distance and photos at fixed intervals.",
        },
        {
          title: "Power towers and lines",
          body: "Captures at the same points on every tower to compare insulator and hardware condition between inspections.",
        },
        {
          title: "Solar panels",
          body: "Automated passes over the plant's tables with a thermal camera to detect faulty modules.",
        },
        {
          title: "Mining and construction",
          body: "Repeatable flights over pits, stockpiles and work fronts to measure volumes and track progress.",
        },
      ],
    },
    faq: [
      {
        q: "Does the app replace DJI Pilot 2?",
        a: "It can complement or replace it for a specific task. The app focuses on your process, such as a specific inspection, and leaves out the features your team doesn't use.",
      },
      {
        q: "Does it work without internet in the field?",
        a: "We define it based on your operation. Capturing on the drone doesn't need internet; uploading photos and data to a platform can happen once you're back online.",
      },
      {
        q: "How much does it cost to develop a DJI drone app?",
        a: "Each project is quoted based on its scope. After the assessment we send you a proposal with stages, timeline and cost, with no commitment.",
      },
    ],
    demoLink: { label: "Watch the app example video", href: "/en#apps" },
  },
  {
    slug: slug("platforms"),
    keyword: "drone inspection software",
    metaTitle: "Drone Inspection Software · Custom Platform",
    metaDescription:
      "Web platform to manage drone inspections: assets on a map, finding review, 3D models and ready-to-download reports. Built for your operation.",
    eyebrow: "Management platforms",
    h1: "Drone inspection software: your own results platform",
    intro:
      "We build drone inspection software as your own web portal, where your team and your clients see each project's progress, review findings and download reports, without passing folders and emails around.",
    sections: [
      {
        h2: "What the inspection management platform includes",
        bullets: [
          "Projects, sites and assets on a map, color-coded by status.",
          "Finding review: every detection is confirmed or dismissed before it reaches the report.",
          "3D models and point clouds to measure volumes and areas.",
          "PDF reports ready to share with your client or management.",
          "Role-based users: administrator, pilot, inspector or viewer.",
        ],
      },
      {
        h2: "Your data, under your control",
        bullets: [
          "Each person signs in with their own account and sees only what applies to them.",
          "Private photos and reports, opened through temporary links.",
          "History of who approved a finding or published a report.",
          "Automatic daily backups.",
        ],
      },
      {
        h2: "In the cloud or on your servers",
        body: "The platform can be hosted in the cloud, where we take care of the server, updates and backups. It can also be installed on your company's infrastructure so the data never leaves your network.",
      },
    ],
    useCases: {
      h2: "Who this platform is for",
      items: [
        {
          title: "Drone service companies",
          body: "That deliver inspections to their clients and want a branded portal instead of sending photo folders.",
        },
        {
          title: "Energy and renewables",
          body: "Wind farms, solar plants and transmission lines with hundreds of assets to inspect every year.",
        },
        {
          title: "Mining and construction",
          body: "Construction progress tracking and stockpile volumetrics with history by date.",
        },
        {
          title: "Industrial maintenance",
          body: "Teams that need to prioritize repairs by the severity of each finding.",
        },
      ],
    },
    faq: [
      {
        q: "Can I connect the platform to the drone app?",
        a: "Yes. Photos and data captured by the app can arrive on the platform organized by project and asset, with no manual steps.",
      },
      {
        q: "Can my clients sign in to see their results?",
        a: "Yes, with view-only users who see only the published reports for their projects.",
      },
      {
        q: "How long does it take to be ready?",
        a: "It depends on the scope. We work in stages, with deliverables you can review and test before moving on, and we give you the timeline in the proposal.",
      },
    ],
    demoLink: { label: "Try the sample portal", href: "/en#portal" },
  },
  {
    slug: slug("web"),
    keyword: "web development for businesses",
    metaTitle: "Website and Web Services Development for Businesses",
    metaDescription:
      "Web development for businesses: corporate websites, forms, quote calculators and integration with your systems. Fast, secure and mobile-first.",
    eyebrow: "Websites and web services",
    h1: "Web development for businesses that need more than a website",
    intro:
      "We do web development for businesses: corporate websites, forms, quote calculators and integrations with the tools you already use. We build what your operation needs to publish or automate on the web, with fast, mobile-first sites.",
    sections: [
      {
        h2: "What we build",
        bullets: [
          "Corporate websites and product or service pages.",
          "Online forms and quote calculators that store every request and email you.",
          "Private dashboards to review and follow up on what comes in from the site.",
          "Integration with spreadsheets, databases and systems you already use.",
          "Hosting, domain and maintenance.",
        ],
      },
      {
        h2: "Fast, secure, Google-ready websites",
        bullets: [
          "Design adapted to phone, tablet and desktop.",
          "Fast loading: optimized images and lightweight code.",
          "SEO best practices: titles, descriptions, sitemap and structured data.",
          "Light and dark theme, and accessibility for every user.",
        ],
      },
    ],
    useCases: {
      h2: "Web projects we build",
      items: [
        { title: "Your company website", body: "Services, case studies and a contact form, with your brand and your domain." },
        {
          title: "Online quote calculator",
          body: "Your clients describe what they need and you receive the complete request in your inbox and on a dashboard.",
        },
        {
          title: "Client portal",
          body: "A private space where your clients check documents, reports or the status of their service.",
        },
        { title: "Automations", body: "Connect forms, emails and spreadsheets so you stop copying data by hand." },
      ],
    },
    faq: [
      {
        q: "Do you handle the domain and hosting?",
        a: "Yes. We can set it up on your account or manage it for you, and we take care of updates.",
      },
      {
        q: "Will the website look good on phones?",
        a: "Yes. We design for phones first and test on different screen sizes before publishing.",
      },
      {
        q: "Can you improve a website I already have?",
        a: "Yes. We review your current site and recommend what to improve or rebuild.",
      },
    ],
    demoLink: { label: "Request an assessment", href: "/en#evaluacion" },
  },
];

/* ---------- Dictionary ---------- */

export const en: Dictionary = {
  meta: {
    locale: "en",
    htmlLang: "en",
    ogLocale: "en_US",
    homePath: "/en",
    servicesBase: "/en/services",
    title: "NEXUS | DJI Drone Apps and Inspection Software",
    description:
      "We build custom apps for DJI drones, platforms to manage drone inspections and websites for businesses. Based in Mexico, working worldwide. Free assessment.",
    ogAlt: "NEXUS · DJI drone apps and inspection software",
    skipToContent: "Skip to content",
  },
  nav: {
    items: [
      { href: "/en#servicios", label: "Services" },
      { href: "/en#apps", label: "DJI apps" },
      { href: "/en#portal", label: "Client portal" },
      { href: "/en#nosotros", label: "About" },
      { href: "/en#proceso", label: "How we work" },
    ],
    homeAria: "NEXUS, home",
    mainAria: "Main",
    mobileAria: "Main mobile",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    cta: "Request an assessment",
    switchLanguageAria: "View this page in Spanish",
  },
  theme: {
    toLight: "Switch to light theme",
    toDark: "Switch to dark theme",
    light: "Light theme",
    dark: "Dark theme",
  },
  hero: {
    eyebrow: "Software · AI · Drones",
    title: "Apps for DJI drones and platforms to manage your inspections.",
    lede: "We build apps tailored to each client's needs across the wide range of DJI drones, web portals where your team reviews the results of every flight, and the websites and web services your operation needs.",
    primaryCta: { href: "#evaluacion", label: "Request an assessment" },
    secondaryCta: { href: "#apps", label: "See an app example" },
    values: [
      { title: "Apps on your DJI controller", body: "They install on DJI RC Plus and RC Pro like any other app." },
      { title: "Repeatable flights", body: "Automated routes and photos: the same result on every inspection." },
      { title: "Results in a portal", body: "Your team and your clients see findings and reports from the browser." },
      { title: "Field-tested", body: "We validate every app with your drones before delivery." },
    ],
    hudCaption: "Sample view of a flight app · simulated data from an automated mapping route",
  },
  hud: {
    live: "Live",
    paused: "Paused",
    resume: "Resume telemetry",
    pause: "Pause telemetry",
    noSignal: "NO SIGNAL",
    phases: {
      preflight: "PRE-FLIGHT",
      takeoff: "TAKEOFF",
      transit: "TRANSIT",
      survey: "SURVEY",
      orbit: "ORBIT",
      return: "RETURN",
      landing: "LANDING",
    },
    altitude: "ALT AGL",
    groundSpeed: "GND SPEED",
    verticalSpeed: "VERT SPEED",
    heading: "HEADING",
    battery: "BATTERY",
    images: "IMAGES",
    linkVideo: "LINK / VIDEO",
    linkAria: "Link {n} of 5",
    altitudeSeries: "Altitude · 12 s",
    speedSeries: "Speed · 12 s",
    mapAria: "Plan view of the survey mission",
    grid: "25 m grid · N↑",
  },
  services: {
    eyebrow: "Services",
    title: "What we build for your drone operation.",
    lede: "From the app the pilot uses in the field to the portal where results are reviewed and your company's website.",
    items: services,
  },
  apps: {
    eyebrow: "Apps for DJI controllers",
    title: "Your inspection process, turned into an app for your team.",
    lede: "Each app is designed around a specific task in your operation. This is an example recorded during a real flight.",
    videoLabel: "Screen recording of the blade inspection app during a flight",
    sequenceAria: "Inspection sequence",
    dronesAlt: "DJI drones",
    controllerAlt: "DJI RC Plus remote controller held with both hands",
    pauseVideo: "Pause app video",
    playVideo: "Play app video",
    example: {
      eyebrow: "Custom app example",
      title: "Wind turbine blade inspection",
      lede: "An app installed on the DJI controller that guides the pilot across the four faces of each blade. It keeps a constant distance to the surface with the drone's laser rangefinder and takes photos at fixed intervals, so every inspection is done the same way.",
      steps: [
        { code: "TE", label: "Trailing edge" },
        { code: "PS", label: "Pressure side" },
        { code: "LE", label: "Leading edge" },
        { code: "SS", label: "Suction side" },
      ],
      features: [
        {
          title: "Guided sequence",
          body: "The top bar shows which face the drone is on and which comes next. The pilot doesn't have to remember the order.",
        },
        {
          title: "Constant distance",
          body: "The laser measures the distance to the blade in real time, so every photo has the same level of detail.",
        },
        {
          title: "Interval photos",
          body: "Capture is automatic during each pass. When finished, images are organized by turbine, blade and face.",
        },
        {
          title: "Pilot in control",
          body: "A button stops the sequence at any time. The pilot always has the final say.",
        },
      ],
    },
    compatibility: {
      title: "Compatible drones and controllers",
      body: "We work with DJI Mobile SDK v5, DJI's official kit for building apps on its controllers. We confirm compatibility for your model during the initial assessment.",
      aircraft: COMPATIBILITY.aircraft,
      controllers: COMPATIBILITY.controllers,
      dronesLabel: "Drones",
      controllersLabel: "Controllers",
    },
  },
  portal: {
    eyebrow: "Client portal",
    title: "One place to see the results of every inspection.",
    lede: "This is what your platform could look like. It's a working demo with sample data: try each section of the portal menu.",
    highlights: [
      { title: "Everything on a map", body: "Each asset is color-coded by status. One click shows its latest inspection." },
      { title: "Findings reviewed by people", body: "Automated detections are confirmed or dismissed before they reach the report." },
      { title: "Reports ready to share", body: "Your client or management downloads the approved PDF without asking by email." },
    ],
    loading: "Loading…",
    views: {
      overview: { label: "Overview", path: "overview", title: "Overview", subtitle: "Status of all your projects" },
      findings: {
        label: "Findings",
        path: "findings/tower-t-0412",
        title: "Findings",
        subtitle: "Review each detection and confirm or dismiss it",
      },
      model: {
        label: "3D model",
        path: "models/north-pit-stockpiles",
        title: "3D model",
        subtitle: "North Pit stockpiles · volume calculated automatically",
      },
      reports: { label: "Reports", path: "reports", title: "Reports", subtitle: "Download approved reports" },
    },
    portalDomain: "portal.yourcompany.com",
    navAria: "Portal sections",
    orgName: "Andean Energy",
    orgSubtitle: "Inspection portal",
    session: "Signed in",
    userName: "Maria Rojas",
    userRole: "Inspector",
    mapOf: "Map of",
    health: { ok: "No issues", observed: "Issues noted", critical: "Needs attention" },
    closeDetail: "Close detail",
    openFindings: "Open findings",
    lastInspection: "Last inspection",
    kpis: {
      inspected: "Assets inspected",
      open: "Open findings",
      critical: "Critical findings",
      reports: "Published reports",
    },
    lastFlight: "Last flight",
    tapHint: "Tap an asset to see its status",
    projectsLabel: "Projects",
    projectFindings: "Project findings",
    sevCritical: "Critical",
    sevModerate: "Moderate",
    sevMinor: "Minor",
    projects,
    reports,
    downloadNotice: 'In the real portal, "{title}" would download (PDF, {pages} pages).',
    reportsAria: "Inspection reports",
    colReport: "Report",
    colDate: "Date",
    colStatus: "Status",
    colActions: "Actions",
    reportsFootnote: "Only published reports are available for download. View-only users see only these.",
    reportStatus: { published: "Published", in_review: "In review", draft: "Draft" },
  },
  inspector: {
    frames,
    imageZoom: "RGB zoom image",
    imageThermal: "thermal image",
    sensor: "Sensor",
    zoom: "RGB zoom",
    thermal: "Thermal",
    asset: "Asset",
    detections: "Detections",
    severity: { critical: "Critical", moderate: "Moderate", minor: "Minor", info: "Info" },
    review: { pending: "Pending", confirmed: "Confirmed", dismissed: "Dismissed" },
    code: "Code",
    confidence: "Confidence",
    component: "Component",
    measurement: "Measurement",
    confirm: "Confirm finding",
    dismiss: "Dismiss",
  },
  pointCloud: {
    aria: "Point cloud of a mining area with two stockpiles and a stepped bench. Drag to orbit.",
    colorMode: "Color mode",
    byHeight: "Height",
    byType: "By type",
    dragHint: "Drag to orbit",
    flightDate: "Flight on 10/31/2026",
    volume: "Stockpile volume",
    area: "Area measured",
    accuracy: "Accuracy",
    points: "Points measured",
    classes: ["Ground", "Stockpile", "Structure"],
  },
  about: {
    eyebrow: "About us",
    title: "Bringing drone technology to more companies.",
    origin: [
      "NEXUS was born from the moment drones are living through. The aircraft are more capable every year, and artificial intelligence now makes it possible to automate flights and analyze what they capture in a fraction of the time it used to take.",
      "Today that technology is within reach of only a few organizations. We want to bring it to more companies, with development tailored to each operation, so they can compete in a fast-growing market.",
    ],
    pillars: [
      {
        id: "objetivo",
        label: "Goal",
        body: "Help more companies compete in the drone market with their own tools: apps that automate every flight and platforms that turn what is captured into information for decision-making.",
      },
      {
        id: "mision",
        label: "Mission",
        body: "Build drone software that cuts time, reduces risk for people and expands what every operation can do, with field-tested solutions designed for the people who use them every day.",
      },
      {
        id: "vision",
        label: "Vision",
        body: "Become a benchmark in drone software development in Mexico and take that work to other markets in the region and around the world.",
      },
    ],
    comparison: {
      title: "Why a drone, not just people",
      lede: "The drone doesn't replace the human team: it takes over the slowest and most dangerous tasks so people can focus on analysis and decisions.",
      columns: ["Traditional method", "With drones and custom software"],
      rows: [
        {
          aspect: "Time",
          before: "Walkdowns, scaffolding or cranes that can take days per site.",
          after: "Automated routes that cover the same site in a fraction of the time and repeat identically every time.",
        },
        {
          aspect: "Risk",
          before: "Staff working at height, near energized equipment or on unstable ground.",
          after: "The pilot operates from a safe spot. The drone is what gets close to the structure.",
        },
        {
          aspect: "Versatility",
          before: "Each task requires its own equipment, specialized staff and logistics.",
          after: "A single drone maps, measures, inspects and documents by changing route or camera.",
        },
      ],
    },
    visionFrom: "Mexico",
    visionTo: "International",
  },
  process: {
    eyebrow: "How we work",
    title: "From the first conversation to the app installed on your controllers.",
    lede: "A staged process, with deliverables you can review and test before moving to the next step.",
    steps: [
      { index: "01", title: "Initial conversation", body: "We learn about your operation, the drones you use and the result you need from each flight." },
      {
        index: "02",
        title: "Proposal and prototype",
        body: "We show you sample screens and a clear scope, with timeline and cost, before we start coding.",
      },
      {
        index: "03",
        title: "Development and field testing",
        body: "We build in stages and test the app with your drones under real operating conditions.",
      },
      {
        index: "04",
        title: "Delivery and ongoing support",
        body: "We install the app on your controllers, train your team and provide support after delivery.",
      },
    ],
    dataTitle: "Your data, under your control",
    dataCare: [
      { title: "Per-user access", body: "Each person signs in with their own account and sees only the projects and information that apply to them." },
      { title: "Private files", body: "Photos and reports are not public. They open through temporary links that expire within minutes." },
      { title: "Change history", body: "There's a record of who approved a finding, published a report or deleted a file." },
      { title: "Automatic backups", body: "Data is backed up daily so a mistake never means losing an inspection." },
    ],
    hostingTitle: "Where is the platform hosted?",
    hosting: [
      {
        id: "cloud",
        name: "In the cloud",
        body: "We take care of the server, updates and backups. You just sign in from the browser.",
      },
      {
        id: "on_premise",
        name: "On your servers",
        body: "We install the platform on your company's infrastructure so the data never leaves your network.",
      },
    ],
    rolesTitle: "Everyone sees what applies to them",
    rolesLede:
      "Permissions are defined by role. A pilot can upload photos without seeing draft reports, and a client can view their reports without access to anyone else's.",
    rolesCaption: "Permissions by role",
    colAction: "Action",
    yes: "Yes",
    no: "No",
    roleMatrix: {
      roles: ["Administrator", "Pilot", "Inspector", "Viewer"],
      permissions: [
        { label: "Add users", grants: [true, false, false, false] },
        { label: "Log flights and upload photos", grants: [true, true, true, false] },
        { label: "Review and approve findings", grants: [true, false, true, false] },
        { label: "Publish reports", grants: [true, false, true, false] },
        { label: "View published reports", grants: [true, true, true, true] },
      ],
    },
  },
  assessment: {
    eyebrow: "Free assessment",
    title: "Tell us what you want to achieve with your drones.",
    lede: "Four short steps. With this information we prepare a proposal designed for your operation, not a generic quote.",
    nextStepsTitle: "What happens next",
    nextSteps: [
      { k: "1", v: "We review your information and email you to schedule a call." },
      { k: "2", v: "We talk about your operation and clarify what you need." },
      { k: "3", v: "We send you a proposal with scope, stages, timeline and cost." },
    ],
    privacyNote:
      "If needed, we sign a non-disclosure agreement before reviewing the details of your operation. Your data is used only to respond to this request.",
  },
  form: {
    steps: ["Project", "Operation", "Goals", "Contact"],
    progressAria: "Form progress",
    successTitle: "Request received",
    reference: "Reference",
    successBody: "We'll review your information and email you to schedule a conversation. Keep this reference for follow-up.",
    newRequest: "New request",
    honeypot: "Website",
    industry: "Your industry",
    services: "What do you need?",
    summary: "Tell us about your project",
    summaryHint: "What you do today, what you'd like to improve and the result you expect.",
    summaryPlaceholder:
      "E.g.: We inspect wind turbines every three months and each pilot does it differently. We want an app that guides the flight and a portal where our clients can see the reports.",
    fleetSize: "How many drones does your team have?",
    models: "Drone and controller models (optional)",
    modelsHint: "If you're not sure, you can leave it blank.",
    modelsPlaceholder: "E.g.: Matrice 4T with RC Plus 2",
    hosting: "If you need a platform, where would you prefer it?",
    objectives: "What do you want to get from your flights?",
    timeline: "When do you need it?",
    fullName: "Full name",
    role: "Job title",
    rolePlaceholder: "Operations manager",
    company: "Company",
    country: "Country",
    email: "Email",
    consent: "Data processing",
    consentLabel: "I authorize the use of this data to respond to this request.",
    consentHint: "It is not shared with third parties. It is deleted after 24 months of inactivity.",
    multiple: "(select all that apply)",
    back: "Back",
    continue: "Continue",
    submit: "Send request",
    sending: "Sending",
    trace: "trace",
    submitErrors: {
      validation: "Please review the highlighted fields.",
      rate_limited: "Too many requests. Please try again in a few minutes.",
      persistence: "We couldn't save your request. Please try again later.",
      unknown: "We couldn't send your request. Check your connection and try again.",
    },
    errors: {
      industry: "Select an industry.",
      services: "Select at least one option.",
      projectSummary: "Tell us a bit more (between 20 and 2000 characters).",
      choose: "Select an option.",
      aircraftModels: "300 characters maximum.",
      objectives: "Select at least one goal.",
      fullName: "Enter your full name.",
      role: "Enter your job title.",
      company: "Enter your company.",
      country: "Enter your country.",
      email: "Enter a valid email.",
      consent: "You must accept data processing.",
    },
    options: {
      industry: [
        { value: "mining", label: "Mining" },
        { value: "energy_transmission", label: "Power lines" },
        { value: "renewables", label: "Solar / wind" },
        { value: "oil_gas", label: "Oil and gas" },
        { value: "civil_infrastructure", label: "Construction" },
        { value: "telecom", label: "Telecommunications" },
        { value: "precision_agriculture", label: "Agriculture" },
        { value: "other", label: "Other" },
      ],
      services: [
        { value: "dji_app", label: "DJI controller app", hint: "Automate flights or captures" },
        { value: "project_platform", label: "Management platform", hint: "Projects, findings and reports" },
        { value: "website", label: "Website or web service", hint: "Site, form or integration" },
        { value: "undecided", label: "Not sure yet", hint: "We'll define it together" },
      ],
      fleetSize: [
        { value: "none", label: "None yet" },
        { value: "1-3", label: "1 to 3" },
        { value: "4-10", label: "4 to 10" },
        { value: "11-30", label: "11 to 30" },
        { value: "30+", label: "More than 30" },
      ],
      hosting: [
        { value: "cloud", label: "In the cloud", hint: "You take care of the server" },
        { value: "on_premise", label: "On our servers", hint: "Inside our network" },
        { value: "undecided", label: "No preference", hint: "I need a recommendation" },
      ],
      objectives: [
        { value: "structural_defects", label: "Detect structural damage" },
        { value: "thermal_inspection", label: "Thermal inspection" },
        { value: "volumes", label: "Measure volumes and stockpiles" },
        { value: "maps", label: "Maps and orthophotos" },
        { value: "progress_tracking", label: "Construction progress tracking" },
        { value: "crop_monitoring", label: "Crop monitoring" },
        { value: "photo_records", label: "Photo records for reports" },
        { value: "other", label: "Other" },
      ],
      timeline: [
        { value: "lt_3m", label: "Less than 3 months" },
        { value: "3_6m", label: "3 to 6 months" },
        { value: "6_12m", label: "6 to 12 months" },
        { value: "exploratory", label: "Just exploring" },
      ],
    },
  },
  footer: {
    tagline: "Custom apps for DJI controllers, platforms to manage inspection projects, and website and web service development.",
    services: "Services",
    sections: "Sections",
    notice: "Notice",
    noticeBody:
      "DJI, Matrice, Mavic and DJI RC are trademarks of SZ DJI Technology Co., Ltd. NEXUS is an independent developer and is not affiliated with DJI. The portal and the viewer on this page use sample data.",
  },
  mascot: {
    name: "Nexo",
    sectionTips: {
      apps: "This video is a real app recorded in flight. Tap the controller screen to pause it.",
      portal: "This is a sample portal and you can use it: tap an asset on the map or switch sections in the menu.",
      nosotros: "Here we explain why NEXUS exists and where we're headed.",
      evaluacion: "Four short steps. If you have questions, you can describe what you need in your own words.",
    },
    quickAnswers: [
      {
        id: "que-hacen",
        question: "What does NEXUS do?",
        answer: [
          "We build three things: custom apps for DJI controllers, web platforms where your team reviews the results of every flight, and websites or web services for your company.",
        ],
        link: { label: "See services", href: "#servicios" },
      },
      {
        id: "mi-dron",
        question: "Does it work with my drone?",
        answer: [
          `We work with DJI Mobile SDK v5. Drones: ${COMPATIBILITY.aircraft.join(", ")}.`,
          `Controllers: ${COMPATIBILITY.controllers.join(", ")}.`,
          "If your model isn't listed, we confirm it during the initial assessment.",
        ],
        link: { label: "See compatibility", href: "#compatibilidad" },
      },
      {
        id: "proceso",
        question: "What is the process?",
        answer: [
          "01. Initial conversation: we learn about your operation, your drones and the result you need.",
          "02. Proposal and prototype: sample screens and a clear scope, with timeline and cost.",
          "03. Development and field testing: we build in stages and test with your drones.",
          "04. Delivery and ongoing support: installation, training and support.",
        ],
        link: { label: "See how we work", href: "#proceso" },
      },
      {
        id: "costo",
        question: "How much does it cost?",
        answer: [
          "Each project is quoted based on its scope. Tell us what you need in the assessment and we'll send you a proposal with stages, timeline and cost, with no commitment.",
        ],
        link: { label: "Request an assessment", href: "#evaluacion" },
      },
    ],
    tour: [
      { href: "#servicios", text: "Let's start with what we do: apps for DJI controllers, management platforms and web development." },
      { href: "#apps", text: "This is a custom app example: it guides the pilot through a wind turbine blade inspection." },
      { href: "#portal", text: "And this is how results look in your own portal. Try it: it's interactive." },
      { href: "#nosotros", text: "Behind it is a team with a clear goal: bringing this technology to more companies." },
      { href: "#proceso", text: "We work in stages, with deliverables you review before moving on." },
      { href: "#evaluacion", text: "Whenever you're ready, tell us about your project here. It's short and free." },
    ],
    ui: {
      hello: "Hi, I'm",
      subtitle: "Your guide to the NEXUS site",
      howCanIHelp: "How can I help?",
      otherQuestions: "Other questions",
      startTour: "Take a guided tour (1 min)",
      showTips: "Show tips while I browse",
      exit: "Exit",
      next: "Next",
      finish: "Finish",
      exitTourAria: "Exit tour",
      closeTipAria: "Close tip",
      helpOf: "Help from",
      closeHelp: "Close help",
      openHelpOf: "Open help from",
      closeHelpOf: "Close help from",
    },
  },
  servicePages,
  servicePage: {
    breadcrumbAria: "Breadcrumb",
    home: "Home",
    services: "Services",
    ctaPrimary: "Request a free assessment",
    faqTitle: "Frequently asked questions",
    ctaTitle: "Tell us about your project",
    ctaBody: "Four short steps. With that information we prepare a proposal with scope, stages, timeline and cost, with no commitment.",
    ctaButton: "Request an assessment",
    otherServices: "Other services",
  },
};
