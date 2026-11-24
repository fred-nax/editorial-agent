export {
  CMS_DESTINATION_IDS,
  DEFAULT_CMS_DESTINATION,
  isCmsDestinationId,
  normalizeCmsDestination,
  type CmsConnectionTestResult,
  type CmsConnector,
  type CmsDestinationDescriptor,
  type CmsDestinationId,
  type CmsDestinationStatus,
  type CmsDraftInput,
  type CmsDraftResult,
} from "@/lib/cms/types";

export {
  CMS_DESTINATION_CATALOG,
  getCmsConnector,
  getCmsDestination,
  isCmsDestinationEnabled,
  listCmsDestinations,
  parseCmsDestinationInput,
} from "@/lib/cms/registry";

export { createWordPressConnector } from "@/lib/cms/wordpress-connector";
