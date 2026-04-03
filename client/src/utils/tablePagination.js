/**
 * 统一表格分页配置（需传入 useTranslation 的 t）
 */
export function getTablePagination(t, overrides = {}) {
  return {
    pageSize: 10,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total) => t("common.paginationTotal", { total }),
    ...overrides,
  };
}
