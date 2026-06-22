import { UNITS, type Unit } from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../db/dexie.js';
import {
  createItem,
  deleteItem,
  resolveBarcode,
  removeBarcode,
  updateItem,
} from '../db/repositories.js';
import { resizeToWebp } from '../lib/resize-image.js';
import { useConfirm } from '../lib/confirm.js';
import { useHydrateItemPhoto } from '../lib/use-hydrate-photo.js';
import { useObjectUrl } from '../lib/use-object-url.js';
import { ScannerModal } from '../features/scanner/scanner-modal.js';
import { BrandsSection } from '../features/brands/brands-section.js';
import { BarcodeBrandChooser } from '../features/brands/barcode-brand-chooser.js';
import { CategoryPicker } from '../features/catalog/category-picker.js';
import { CommentsSection } from '../features/catalog/comments-section.js';

const labelClass = 'text-sm font-medium text-zinc-600';
const inputClass =
  'min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100';

export function ItemFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const params = useParams({ strict: false }) as { id?: string };
  const editingId = params.id ?? null;

  const existing = useLiveQuery(
    () => (editingId ? db.items.get(editingId) : undefined),
    [editingId],
  );
  const existingBarcodes = useLiveQuery(
    () =>
      editingId
        ? db.barcodes.where('itemId').equals(editingId).filter((b) => b.deletedAt === null).toArray()
        : [],
    [editingId],
    [],
  );
  const brandsForItem = useLiveQuery(
    () =>
      editingId
        ? db.brands.where('itemId').equals(editingId).filter((b) => b.deletedAt === null).toArray()
        : [],
    [editingId],
    [],
  );

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [minStock, setMinStock] = useState('');
  const [unit, setUnit] = useState<Unit>('un');
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoTouched, setPhotoTouched] = useState(false);
  // barcodes pendentes (modo criar) antes de existir o item
  const [pendingBarcodes, setPendingBarcodes] = useState<string[]>([]);
  // código escaneado aguardando escolha de marca (modo edição)
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hydratedFor = useRef<string | null>(null);

  // hidrata uma vez quando o item em edição carrega do Dexie
  useEffect(() => {
    if (editingId && existing && hydratedFor.current !== editingId) {
      hydratedFor.current = editingId;
      setName(existing.name);
      setCategoryId(existing.categoryId ?? null);
      setCategoryName(existing.category ?? null);
      setNotes(existing.notes ?? '');
      setMinStock(existing.minStock != null ? String(existing.minStock) : '');
      setUnit(existing.unit);
      setPhotoBlob(existing.photoBlob ?? null);
    }
  }, [editingId, existing]);

  // foto remota (R2): baixa pro cache; quando chega e o usuário não mexeu, mostra
  useHydrateItemPhoto(editingId ?? '', existing?.photoKey, existing?.photoBlob);
  useEffect(() => {
    if (!photoTouched && existing?.photoBlob) setPhotoBlob(existing.photoBlob);
  }, [existing?.photoBlob, photoTouched]);

  const photoUrl = useObjectUrl(photoBlob);
  const barcodes = editingId ? existingBarcodes.map((b) => b.barcode) : pendingBarcodes;
  const brandNameById = new Map(brandsForItem.map((b) => [b.id, b.name]));
  const brandByCode = new Map(existingBarcodes.map((b) => [b.barcode, b.brandId]));

  async function onPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const webp = await resizeToWebp(file);
    setPhotoBlob(webp);
    setPhotoTouched(true);
  }

  async function onScanned(code: string) {
    if (barcodes.includes(code)) return;
    if (editingId) {
      const owner = (await resolveBarcode(code))?.itemId ?? null;
      if (owner && owner !== editingId) {
        setError(t('catalog.duplicateBarcode'));
        return;
      }
      // escolhe a marca desse código antes de salvar
      setPendingCode(code);
    } else {
      setPendingBarcodes((prev) => [...prev, code]);
    }
  }

  async function onRemoveBarcode(code: string) {
    if (editingId) {
      const row = existingBarcodes.find((b) => b.barcode === code);
      if (row) await removeBarcode(row.id);
    } else {
      setPendingBarcodes((prev) => prev.filter((c) => c !== code));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const ms = minStock.trim() ? Number(minStock.replace(',', '.')) : null;
    try {
      if (editingId) {
        await updateItem(editingId, {
          name: name.trim(),
          category: categoryName,
          categoryId,
          notes: notes.trim() || null,
          minStock: ms,
          unit,
          ...(photoTouched ? { photoBlob } : {}),
        });
      } else {
        await createItem({
          name: name.trim(),
          category: categoryName,
          categoryId,
          notes: notes.trim() || null,
          minStock: ms,
          unit,
          photoBlob,
          barcodes: pendingBarcodes,
        });
      }
      navigate({ to: '/itens' });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'generic';
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }));
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!editingId) return;
    const ok = await confirm({
      title: t('catalog.deleteItem'),
      message: t('catalog.deleteConfirm'),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await deleteItem(editingId);
    navigate({ to: '/itens' });
  }

  return (
    <main className="flex flex-col gap-5 px-5 py-6">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate({ to: '/itens' })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
        <h1 className="text-lg font-bold text-zinc-900">
          {editingId ? t('catalog.editItem') : t('catalog.newItem')}
        </h1>
        <span className="w-12" />
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500"
          >
            {photoUrl ? (
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              t('catalog.addPhoto')
            )}
          </button>
          {photoBlob && (
            <button
              type="button"
              onClick={() => {
                setPhotoBlob(null);
                setPhotoTouched(true);
              }}
              className="text-xs text-red-600"
            >
              {t('catalog.removePhoto')}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhotoPick}
            className="hidden"
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('catalog.itemName')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('catalog.category')}</span>
          <CategoryPicker
            value={categoryId}
            onChange={(c) => {
              setCategoryId(c?.id ?? null);
              setCategoryName(c?.name ?? null);
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('catalog.notes')}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('catalog.notesHint')}
            maxLength={2000}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('catalog.unit')}</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className={inputClass}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {t(`catalog.units.${u}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t('catalog.minStock')}</span>
          <input
            value={minStock}
            onChange={(e) => setMinStock(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            placeholder={t('catalog.minStockHint')}
            className={inputClass}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className={labelClass}>{t('catalog.barcodes')}</span>
          {barcodes.length === 0 ? (
            <p className="text-sm text-zinc-400">{t('catalog.noBarcodes')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {barcodes.map((code) => {
                const brandId = brandByCode.get(code);
                return (
                  <li
                    key={code}
                    className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-sm">{code}</span>
                      {brandId && (
                        <span className="ml-2 text-xs text-zinc-500">{brandNameById.get(brandId)}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveBarcode(code)}
                      className="shrink-0 text-sm text-red-600"
                    >
                      {t('common.delete')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="min-h-11 rounded-xl border border-green-600 px-4 py-2.5 text-sm font-semibold text-green-700"
          >
            {t('catalog.scan')}
          </button>
        </div>

        {editingId && <BrandsSection itemId={editingId} />}

        {editingId && <CommentsSection itemId={editingId} />}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="min-h-12 w-full rounded-xl bg-green-600 px-4 py-3 text-base font-semibold text-white active:bg-green-700 disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>

        {editingId && (
          <button type="button" onClick={onDelete} className="min-h-11 text-sm font-medium text-red-600">
            {t('catalog.deleteItem')}
          </button>
        )}
      </form>

      {scannerOpen && (
        <ScannerModal onDetect={onScanned} onClose={() => setScannerOpen(false)} />
      )}
      {pendingCode && editingId && (
        <BarcodeBrandChooser
          itemId={editingId}
          code={pendingCode}
          onDone={() => setPendingCode(null)}
        />
      )}
    </main>
  );
}
