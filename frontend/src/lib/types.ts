import type { RegistrationSchema } from "@/components/registration-fields";
export type Actor = {
  id: string;
  organization_id?: string;
  organization_slug?: string;
  name: string;
  role:
    | "admin"
    | "registration"
    | "scheduling"
    | "referee"
    | "viewer"
    | "participant";
  team_id?: string;
};
export type Category = {
  price_cents: number;
  payment_mode: string;
  participant_count: number;
  registration_starts_at?: string | null;
  registration_ends_at?: string | null;
  payment_policy: string;
  id: string;
  name: string;
  capacity: number;
  group_size: number;
  qualifiers: number;
  duration_minutes: number;
  rest_minutes: number;
  draw_published: boolean;
  draw_seed: string | null;
  rules: {
    sets: number;
    games: number;
    superTiebreak: boolean;
    goldenPoint: boolean;
  };
};
export type Team = {
  image_id?: string;
  notifications?: boolean;
  id: string;
  name: string;
  players: { name: string; email?: string; phone?: string; answers?: Record<string, unknown> }[];
  extra_answers?: Record<string, unknown>;
  registration_source?: string;
  category_id: string;
  status: string;
  email?: string;
  phone?: string;
  captain: number;
  description: string;
  created_at: string;
};
export type Match = {
  id: string;
  category_id: string;
  group_id: string | null;
  stage: string;
  round: number;
  position: number;
  home_id: string | null;
  away_id: string | null;
  court_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  winner_id: string | null;
  score: { sets: [number, number][]; reason?: string } | null;
};
export type Highlight = {
  icon: "trophy" | "gift" | "target" | "star" | "award" | "users";
  title: string;
  text: string;
};
export type Court = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
  enabled: boolean;
};
export type Sponsor = {
  id: string;
  name: string;
  website: string;
  email: string;
  phone: string;
  logo_url: string;
  level_id: string | null;
  status: string;
  notes: string;
  affinity: number;
  evidence: { url: string; note: string; date: string; confidence: string }[];
};
export type Message = {
  id: string;
  sponsor_id: string;
  sponsor_name: string;
  subject: string;
  body: string;
  channel: string;
  status: string;
  email: string;
  phone: string;
  attempts: number;
  error: string | null;
};
export type Standing = {
  team_id: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  sets_for: number;
  sets_against: number;
  games_for: number;
  games_against: number;
  criterion: string;
  tie: boolean;
};
export type State = {
  organization: {
    id: string;
    name: string;
    slug: string;
    brand_color?: string | null;
    brand_bg?: string | null;
    brand_card?: string | null;
    brand_platform?: boolean;
  };
  tournament: {
    id: string;
    name: string;
    venue: string;
    city: string;
    starts_on: string;
    ends_on: string;
    timezone: string;
    auto_approve: boolean;
    registration_open: boolean;
    registration_schema?: RegistrationSchema;
    highlights?: Highlight[];
    status: string;
  } | null;
  categories: Category[];
  teams: Team[];
  matches: Match[];
  courts: Court[];
  groups: {
    id: string;
    category_id: string;
    name: string;
    team_ids: string[];
  }[];
  standings: { group_id: string; rows: Standing[] }[];
  sponsors: Sponsor[];
  levels: {
    id: string;
    name: string;
    amount: string;
    benefits: string;
    zones: string[];
    priority: number;
    logo_size: number;
  }[];
  requests: {
    id: string;
    team_name: string;
    kind: string;
    reason: string;
    status: string;
    before_value: Record<string, string>;
    after_value: Record<string, string>;
  }[];
  messages: Message[];
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
  }[];
  audit: {
    id: string;
    action: string;
    actor: string;
    created_at: string;
    resource_id: string;
  }[];
  archives: { id: string; name: string; starts_on: string }[];
  integrations: { chatkit: boolean; gmail: boolean; smtp: boolean };
};
