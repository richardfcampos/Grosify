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
import { useHouseholdPlan } from '../lib/use-currency.js';
import { useHydrateItemPhoto } from '../lib/use-hydrate-photo.js';
import { useObjectUrl } from '../lib/use-object-url.js';
import { PaywallSheet } from '../features/billing/paywall-sheet.js';
import { ScannerModal } from '../features/scanner/scanner-modal.js';
import { BrandsSection } from '../features/brands/brands-section.js';
import { BarcodeBrandChooser } from '../features/brands/barcode-brand-chooser.js';
import { CategoryPicker } from '../features/catalog/category-picker.js';
import { CommentsSection } from '../features/catalog/comments-section.js';
import { Button, Icon } from '../features/ui/index.js';

const labelClass = 'kicker mb-1 block';
const inputClass = 'gro-field';

export function ItemFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const plan = useHouseholdPlan();
  const [paywallOpen, setPaywallOpen] = useState(false);
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
    <main className="screen-in flex flex-col gap-5 px-[18px] py-6">
      <header className="flex items-center justify-between">
        <button
          onClick={() => navigate({ to: '/itens' })}
          className="muted flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="back" size={17} /> {t('common.back')}
        </button>
        <h1 className="text-lg font-bold tracking-tight">
          {editingId ? t('catalog.editItem') : t('catalog.newItem')}
        </h1>
        <span className="w-12" />
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => (plan === 'free' ? setPaywallOpen(true) : fileRef.current?.click())}
            className="muted flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl text-sm"
            style={{ border: '2px dashed var(--app-border)', background: 'var(--app-surface-2)' }}
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
              className="text-xs"
              style={{ color: 'var(--gro-red)' }}
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
            <p className="muted text-sm">{t('catalog.noBarcodes')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {barcodes.map((code) => {
                const brandId = brandByCode.get(code);
                return (
                  <li
                    key={code}
                    className="flex items-center justify-between rounded-xl px-3 py-2"
                    style={{ background: 'var(--app-surface-2)' }}
                  >
                    <span className="min-w-0 truncate">
                      <span className="mono text-sm">{code}</span>
                      {brandId && <span className="muted ml-2 text-xs">{brandNameById.get(brandId)}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveBarcode(code)}
                      className="shrink-0 text-sm"
                      style={{ color: 'var(--gro-red)' }}
                    >
                      {t('common.delete')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button type="button" variant="secondary" size="md" onClick={() => setScannerOpen(true)}>
            <Icon name="scan" size={18} /> {t('catalog.scan')}
          </Button>
        </div>

        {editingId && <BrandsSection itemId={editingId} />}

        {editingId && <CommentsSection itemId={editingId} />}

        {error && <p className="text-sm" style={{ color: 'var(--gro-red)' }}>{error}</p>}

        <Button variant="primary" size="lg" fullWidth type="submit" disabled={busy || !name.trim()}>
          {busy ? t('common.saving') : t('common.save')}
        </Button>

        {editingId && (
          <button type="button" onClick={onDelete} className="min-h-11 text-sm font-medium" style={{ color: 'var(--gro-red)' }}>
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
      {paywallOpen && <PaywallSheet feature="photos" onClose={() => setPaywallOpen(false)} />}
    </main>
  );
}
