"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tags, Loader2, Search, Percent, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import {
  getPricingServices,
  updateGlobalMargin,
  updateServiceMargin,
  resetServiceMargin,
  type AdminPricingService,
} from "@/lib/api/admin";
import type { ApiError } from "@/types/api";
import { formatCurrency } from "@/lib/utils/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function calcSellingPrice(originalPrice: string, margin: string): number {
  return Number(originalPrice) * (1 + Number(margin || 0) / 100);
}

export default function AdminPricingPage() {
  const [services, setServices] = useState<AdminPricingService[]>([]);
  const [globalMargin, setGlobalMargin] = useState("10");
  const [globalInput, setGlobalInput] = useState("10");
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [overrideOnly, setOverrideOnly] = useState(false);
  const [active, setActive] = useState<boolean | "">("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState<{ open: boolean; service: AdminPricingService | null }>({ open: false, service: null });
  const [marginInput, setMarginInput] = useState("");
  const [resetDialog, setResetDialog] = useState<{ open: boolean; service: AdminPricingService | null }>({ open: false, service: null });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPricing = useCallback(async (page: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getPricingServices({ page, limit: pagination.limit, search: search || undefined, category: category || undefined, overrideOnly, active });
      setServices(res.data);
      setGlobalMargin(res.globalDefaultMargin);
      setGlobalInput(res.globalDefaultMargin);
      setPagination(res.pagination);
    } catch {
      setError("Không thể tải cấu hình giá dịch vụ.");
    } finally {
      setIsLoading(false);
    }
  }, [active, category, overrideOnly, pagination.limit, search]);

  useEffect(() => { loadPricing(pagination.page); }, [pagination.page, pagination.limit, category, overrideOnly, active]);

  const categories = useMemo(() => Array.from(new Set(services.map((s) => s.category))).sort(), [services]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPagination((prev) => ({ ...prev, page: 1 }));
      loadPricing(1);
    }, 400);
  }

  async function saveGlobalMargin() {
    const margin = Number(globalInput);
    if (Number.isNaN(margin) || margin < 0) return toast.error("Margin không hợp lệ.");
    setIsSavingGlobal(true);
    try {
      const res = await updateGlobalMargin(margin);
      toast.success(`${res.message}. ${res.affectedServices} dịch vụ được cập nhật.`);
      loadPricing(pagination.page);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      toast.error(axiosErr.response?.data?.error || "Không thể cập nhật margin chung.");
    } finally {
      setIsSavingGlobal(false);
    }
  }

  function openEdit(service: AdminPricingService) {
    setEditDialog({ open: true, service });
    setMarginInput(service.profitMargin);
  }

  async function saveServiceMargin() {
    if (!editDialog.service) return;
    const margin = Number(marginInput);
    if (Number.isNaN(margin) || margin < 0) return toast.error("Margin không hợp lệ.");
    try {
      const res = await updateServiceMargin(editDialog.service.id, margin);
      toast.success(res.message);
      setEditDialog({ open: false, service: null });
      loadPricing(pagination.page);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      toast.error(axiosErr.response?.data?.error || "Không thể cập nhật margin dịch vụ.");
    }
  }

  async function confirmReset() {
    if (!resetDialog.service) return;
    try {
      const res = await resetServiceMargin(resetDialog.service.id);
      toast.success(res.message);
      setResetDialog({ open: false, service: null });
      loadPricing(pagination.page);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      toast.error(axiosErr.response?.data?.error || "Không thể reset margin dịch vụ.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-app-fg"><Tags className="h-6 w-6 text-brand-500" />Giá dịch vụ</h1>
        <p className="mt-1 text-sm text-app-muted">Quản lý tỉ lệ chênh lệch giá chung và override theo từng dịch vụ.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-brand-500" />Margin mặc định toàn hệ thống</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
          <div className="rounded-lg border border-app-border bg-app-elevated p-4">
            <p className="text-sm text-app-muted">Margin hiện tại</p>
            <p className="mt-1 text-3xl font-bold text-brand-500">{globalMargin}%</p>
            <p className="mt-2 text-xs text-app-muted">Chỉ áp dụng cho dịch vụ không có override riêng. Override từng dịch vụ sẽ được giữ nguyên.</p>
          </div>
          <div className="space-y-2"><Label htmlFor="global-margin">Margin mới (%)</Label><Input id="global-margin" type="number" min={0} step="0.01" value={globalInput} onChange={(e) => setGlobalInput(e.target.value)} /></div>
          <Button onClick={saveGlobalMargin} isLoading={isSavingGlobal}>Áp dụng</Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_140px_110px]">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" /><Input placeholder="Tìm tên dịch vụ hoặc provider ID..." value={search} onChange={handleSearchChange} className="pl-10" /></div>
        <Select value={category} onChange={(e) => { setCategory(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}><option value="">Tất cả category</option>{categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}</Select>
        <Select value={active === "" ? "" : String(active)} onChange={(e) => { setActive(e.target.value === "" ? "" : e.target.value === "true"); setPagination((p) => ({ ...p, page: 1 })); }}><option value="">Tất cả trạng thái</option><option value="true">Đang bật</option><option value="false">Đang tắt</option></Select>
        <Select value={overrideOnly ? "true" : "false"} onChange={(e) => { setOverrideOnly(e.target.value === "true"); setPagination((p) => ({ ...p, page: 1 })); }}><option value="false">Tất cả</option><option value="true">Chỉ override</option></Select>
        <Select value={String(pagination.limit)} onChange={(e) => setPagination((p) => ({ ...p, page: 1, limit: Number(e.target.value) }))}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></Select>
      </div>

      {error && <div className="rounded-md bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>}
      {isLoading && <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-brand-500" /></div>}

      {!isLoading && !error && (
        <>
          <div className="rounded-lg border border-app-border bg-app-card">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Dịch vụ</TableHead><TableHead>Giá gốc</TableHead><TableHead>Giá bán</TableHead><TableHead>Margin</TableHead><TableHead>Min/Max</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
              <TableBody>
                {services.map((svc) => (
                  <TableRow key={svc.id}>
                    <TableCell><div className="max-w-md"><p className="truncate text-sm font-medium text-app-fg">{svc.name}</p><p className="text-xs text-app-muted">{svc.category} • #{svc.providerServiceId}</p></div></TableCell>
                    <TableCell className="tabular-nums text-app-fg">{formatCurrency(svc.originalPrice)}</TableCell>
                    <TableCell className="tabular-nums font-semibold text-brand-500">{formatCurrency(svc.sellingPrice)}</TableCell>
                    <TableCell><div className="flex items-center gap-2"><span className="font-medium text-app-fg">{svc.profitMargin}%</span>{svc.isMarginOverride && <Badge variant="warning">Override</Badge>}</div></TableCell>
                    <TableCell className="text-sm text-app-muted">{svc.minQuantity} / {svc.maxQuantity}</TableCell>
                    <TableCell><Badge variant={svc.isActive ? "success" : "secondary"}>{svc.isActive ? "Bật" : "Tắt"}</Badge></TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(svc)}>Sửa margin</Button>{svc.isMarginOverride && <Button size="sm" variant="secondary" onClick={() => setResetDialog({ open: true, service: svc })}><RotateCcw className="mr-1 h-3.5 w-3.5" />Reset</Button>}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {services.length === 0 && <div className="rounded-lg border border-app-border bg-app-card py-12 text-center text-sm text-app-muted">Không tìm thấy dịch vụ.</div>}
          <div className="flex items-center justify-between"><p className="text-sm text-app-muted">Trang {pagination.page} / {pagination.totalPages || 1} • {pagination.total.toLocaleString("vi-VN")} dịch vụ</p><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>Trước</Button><Button variant="secondary" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>Tiếp</Button></div></div>
        </>
      )}

      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, service: null })}>
        <DialogContent onClose={() => setEditDialog({ open: false, service: null })}>
          <DialogHeader><DialogTitle>Override margin dịch vụ</DialogTitle><DialogDescription>{editDialog.service?.name}</DialogDescription></DialogHeader>
          <div className="space-y-4"><div className="grid grid-cols-2 gap-3 rounded-lg border border-app-border bg-app-elevated p-3 text-sm"><div><p className="text-app-muted">Giá gốc</p><p className="font-semibold text-app-fg">{formatCurrency(editDialog.service?.originalPrice || "0")}</p></div><div><p className="text-app-muted">Preview giá bán</p><p className="font-semibold text-brand-500">{formatCurrency(calcSellingPrice(editDialog.service?.originalPrice || "0", marginInput).toString())}</p></div></div><div className="space-y-2"><Label htmlFor="service-margin">Margin mới (%)</Label><Input id="service-margin" type="number" min={0} step="0.01" value={marginInput} onChange={(e) => setMarginInput(e.target.value)} /></div></div>
          <DialogFooter><Button variant="secondary" onClick={() => setEditDialog({ open: false, service: null })}>Hủy</Button><Button onClick={saveServiceMargin}>Lưu override</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetDialog.open} onOpenChange={(open) => !open && setResetDialog({ open: false, service: null })}>
        <DialogContent onClose={() => setResetDialog({ open: false, service: null })}><DialogHeader><DialogTitle>Reset margin dịch vụ</DialogTitle><DialogDescription>Reset {resetDialog.service?.name} về margin chung {globalMargin}%?</DialogDescription></DialogHeader><div className="rounded-lg border border-app-border bg-app-elevated p-3 text-sm"><p className="text-app-muted">Giá bán sau reset</p><p className="font-semibold text-brand-500">{formatCurrency(calcSellingPrice(resetDialog.service?.originalPrice || "0", globalMargin).toString())}</p></div><DialogFooter><Button variant="secondary" onClick={() => setResetDialog({ open: false, service: null })}>Hủy</Button><Button onClick={confirmReset}>Reset về mặc định</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
