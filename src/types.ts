export interface Env {
  GOIT_AUTH: KVNamespace;
  SLACK_WEBHOOK_URL: string;
  GOIT_USERNAME: string;
  GOIT_PASSWORD: string;
  TIMEZONE?: string;
  CALENDAR_URL?: string;
  GROUP_IDS?: string;
}

export interface GoitAuthState {
  accessToken?: string;
  refreshToken: string;
  accessTokenExpiresAt?: number;
}

export interface GoitEventResource {
  id?: string | number;
  type?: string;
  groupId?: string | number;
  courseId?: string | number;
  moduleId?: string | number;
  moduleName?: string;
  courseName?: string;
  meetType?: string;
  tutorFirstName?: string;
  tutorLastName?: string;
  [key: string]: unknown;
}

export interface GoitEvent {
  id?: string | number;
  title?: string;
  start?: string;
  end?: string;
  startUtcDateTime?: string;
  endUtcDateTime?: string;
  resource?: GoitEventResource;
  [key: string]: unknown;
}
