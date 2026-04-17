/*
 * Admin panel types — ported from the Angular AdminService interfaces.
 */

export interface Access {
  _id?: string;
  code?: string;
  expiration?: string | null;
  ident?: string;
  limit?: number | null;
  order?: number;
  systems?: AccessSystems;
}

export type AccessSystems =
  | { id: number; talkgroups: { id: number }[] | number[] | '*' }[]
  | number[]
  | '*';

export interface ApiKey {
  _id?: string;
  disabled?: boolean;
  ident?: string;
  key?: string;
  order?: number;
  systems?: AccessSystems;
}

export interface AdminConfig {
  access?: Access[];
  apiKeys?: ApiKey[];
  dirWatch?: DirWatch[];
  downstreams?: Downstream[];
  groups?: Group[];
  options?: AdminOptions;
  systems?: AdminSystem[];
  tags?: Tag[];
}

export interface DirWatch {
  _id?: string;
  delay?: number;
  deleteAfter?: boolean;
  directory?: string;
  disabled?: boolean;
  extension?: string;
  frequency?: number | null;
  mask?: string;
  order?: number;
  systemId?: number | null;
  talkgroupId?: number | null;
  type?: string;
}

export interface Downstream {
  _id?: string;
  apiKey?: string;
  disabled?: boolean;
  order?: number;
  systems?: AccessSystems;
  url?: string;
}

export interface Group {
  _id?: number;
  label?: string;
}

export interface Tag {
  _id?: number;
  label?: string;
}

export interface AdminOptions {
  afsSystems?: string;
  audioConversion?: 0 | 1 | 2 | 3;
  autoPopulate?: boolean;
  branding?: string;
  dimmerDelay?: number;
  disableDuplicateDetection?: boolean;
  duplicateDetectionTimeFrame?: number;
  keypadBeeps?: string;
  maxClients?: number;
  playbackGoesLive?: boolean;
  pruneDays?: number;
  searchPatchedTalkgroups?: boolean;
  showListenersCount?: boolean;
  sortTalkgroups?: boolean;
  tagsToggle?: boolean;
  time12hFormat?: boolean;
}

export interface AdminSystem {
  _id?: number;
  autoPopulate?: boolean;
  blacklists?: string;
  id?: number;
  label?: string;
  led?: string | null;
  order?: number | null;
  talkgroups?: AdminTalkgroup[];
  units?: AdminUnit[];
}

export interface AdminTalkgroup {
  frequency?: number | null;
  groupId?: number;
  id?: number;
  label?: string;
  led?: string | null;
  name?: string;
  order?: number;
  tagId?: number;
}

export interface AdminUnit {
  id?: number | null;
  label?: string;
  order?: number;
}

export interface Log {
  _id: number;
  dateTime: string;
  level: string;
  message: string;
}

export interface LogsQuery {
  count: number;
  dateStart: string;
  dateStop: string;
  options: LogsQueryOptions;
  logs: Log[];
}

export interface LogsQueryOptions {
  date?: string;
  level?: 'error' | 'info' | 'warn';
  limit: number;
  offset: number;
  sort: number;
}

export interface Todo {
  level: 'info' | 'warn';
  message: string;
}

export const LED_COLORS = [
  'blue',
  'cyan',
  'green',
  'magenta',
  'orange',
  'red',
  'white',
  'yellow',
] as const;
