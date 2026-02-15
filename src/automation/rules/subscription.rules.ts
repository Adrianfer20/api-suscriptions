import { Subscription } from '../../subscriptions/models/subscription.model';
import { formatDateInTimeZone } from '../../subscriptions/utils/date.util';

export interface AutomationRuleContext {
  timeZone?: string;
  referenceDate?: Date;
}

export interface TodayInfo {
  todayIso: string;
  timeZone: string;
}

const DEFAULT_TIMEZONE = process.env.AUTOMATION_TZ || 'America/Caracas';

export function getTodayInfo(context?: AutomationRuleContext): TodayInfo {
  const { timeZone = DEFAULT_TIMEZONE, referenceDate = new Date() } = context || {};
  return {
    todayIso: formatDateInTimeZone(referenceDate, timeZone),
    timeZone
  };
}
