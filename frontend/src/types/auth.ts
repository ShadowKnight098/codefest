export interface Participant {
  id: string;
  roll_number: string;
  name: string;
  email: string;
  academic_year: number;
  is_enabled: boolean;
}

export type ParticipantState =
  | 'LEVEL1_AVAILABLE'
  | 'LEVEL1_IN_PROGRESS'
  | 'LEVEL1_COMPLETED'
  | 'QUALIFIED'
  | 'NOT_QUALIFIED'
  | 'WAITING_FOR_LEVEL2'
  | 'LEVEL2_AVAILABLE'
  | 'LEVEL2_IN_PROGRESS'
  | 'COMPLETED'
  | 'TERMINATED';

export interface RoundInfo {
  round_id: string;
  round_number: number;
  name: string;
  is_open: boolean;
  duration_minutes: number;
}

export interface ResultSummary {
  round_number: number;
  score: number;
  total_marks: number;
  is_qualified: boolean;
  status_label: string;
}

export interface DashboardState {
  participant_name: string;
  roll_number: string;
  academic_year: number;
  email: string;
  state: ParticipantState;
  state_headline: string;
  state_description: string;
  can_start_level1: boolean;
  can_resume_level1: boolean;
  can_start_level2: boolean;
  can_resume_level2: boolean;
  current_level1_attempt_id?: string | null;
  current_level2_attempt_id?: string | null;
  level1_round?: RoundInfo | null;
  level2_round?: RoundInfo | null;
  level1_result?: ResultSummary | null;
  level2_result?: ResultSummary | null;
  violations_count: number;
}
