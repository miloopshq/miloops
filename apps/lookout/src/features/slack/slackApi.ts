import { slackSettingsApi } from '@teamtrail/connector-slack';
import { BRAND } from '@teamtrail/core';

export const slackApi = slackSettingsApi(BRAND.apiPrefix);
