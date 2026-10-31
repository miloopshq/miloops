import { slackSettingsApi } from '@miloops-hq/connector-slack';
import { BRAND } from '@miloops-hq/core';

export const slackApi = slackSettingsApi(BRAND.apiPrefix);
