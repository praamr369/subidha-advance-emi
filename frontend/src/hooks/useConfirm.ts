import { useCallback } from "react";
export function useConfirm() { return useCallback((message: string) => window.confirm(message), []); }
