import React, { useState, useMemo, useEffect } from 'react';
import { 
  MapPin, 
  Building2, 
  Layers, 
  LayoutGrid, 
  Box, 
  ChevronRight, 
  Check, 
  X,
  ExternalLink
} from 'lucide-react';
import { WarehouseLocationV2 } from '../../api/mfgApiV2';

interface LocationSelectPopupProps {
  label: string;
  locations: WarehouseLocationV2[];
  warehouseId: string;
  floorId: string;
  zoneId: string;
  locationId: string;
  onChange: (warehouseId: string, floorId: string, zoneId: string, locationId: string) => void;
  badgeColor?: 'blue' | 'rose' | 'indigo' | 'emerald';
  disabled?: boolean;
  required?: boolean;
}

const FALLBACK_LOCATIONS: WarehouseLocationV2[] = [
  { _id: 'fact-skbw', name: 'SKBW Factory', level: 'Factory', parentId: null, status: 'Active' },
  { _id: 'floor-ground', name: 'Ground Floor', level: 'Floor', parentId: 'fact-skbw', status: 'Active' },
  { _id: 'zone-a', name: 'Zone A', level: 'Zone', parentId: 'floor-ground', status: 'Active' },
  { _id: 'loc-top', name: 'Top', level: 'Storage Location', parentId: 'zone-a', status: 'Active' },
  { _id: 'loc-bottom', name: 'Bottom', level: 'Storage Location', parentId: 'zone-a', status: 'Active' },
  { _id: 'zone-b', name: 'Zone B', level: 'Zone', parentId: 'floor-ground', status: 'Active' },
  { _id: 'loc-b-top', name: 'Top', level: 'Storage Location', parentId: 'zone-b', status: 'Active' },
  { _id: 'loc-b-bottom', name: 'Bottom', level: 'Storage Location', parentId: 'zone-b', status: 'Active' },
  { _id: 'floor-first', name: 'First Floor', level: 'Floor', parentId: 'fact-skbw', status: 'Active' },
  { _id: 'zone-c', name: 'Zone C', level: 'Zone', parentId: 'floor-first', status: 'Active' },
  { _id: 'loc-c-rack1', name: 'Rack 1', level: 'Storage Location', parentId: 'zone-c', status: 'Active' }
];

export const LocationSelectPopup: React.FC<LocationSelectPopupProps> = ({
  label,
  locations = [],
  warehouseId,
  floorId,
  zoneId,
  locationId,
  onChange,
  badgeColor = 'blue',
  disabled = false,
  required = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Use provided locations or fallback
  const allLocs = useMemo(() => {
    return Array.isArray(locations) && locations.length > 0 ? locations : FALLBACK_LOCATIONS;
  }, [locations]);

  // Lookup map
  const locMap = useMemo(() => {
    const map = new Map<string, WarehouseLocationV2>();
    allLocs.forEach(l => {
      if (l && l._id) map.set(String(l._id), l);
    });
    return map;
  }, [allLocs]);

  // Hierarchy filter helpers
  const warehouses = useMemo(() => {
    const list = allLocs.filter(l => l.level === 'Factory' || (!l.parentId && !l.level));
    return list.length > 0 ? list : [allLocs[0]];
  }, [allLocs]);

  const getFloors = (whId: string) => {
    const list = allLocs.filter(l => l.level === 'Floor' && String(l.parentId) === String(whId));
    return list.length > 0 ? list : allLocs.filter(l => l.level === 'Floor');
  };

  const getZones = (fId: string) => {
    const list = allLocs.filter(l => l.level === 'Zone' && String(l.parentId) === String(fId));
    return list.length > 0 ? list : allLocs.filter(l => l.level === 'Zone');
  };

  const getStorageLocations = (zId: string) => {
    const list = allLocs.filter(l => (l.level === 'Storage Location' || !allLocs.some(c => c.parentId === l._id)) && String(l.parentId) === String(zId));
    return list.length > 0 ? list : allLocs.filter(l => l.level === 'Storage Location');
  };

  // Internal draft state when modal is open
  const [tempWh, setTempWh] = useState<string>(warehouseId);
  const [tempFloor, setTempFloor] = useState<string>(floorId);
  const [tempZone, setTempZone] = useState<string>(zoneId);
  const [tempLoc, setTempLoc] = useState<string>(locationId);

  // Sync when prop values change or popup opens
  useEffect(() => {
    if (isOpen) {
      setTempWh(warehouseId || (warehouses[0]?._id ?? ''));
      setTempFloor(floorId);
      setTempZone(zoneId);
      setTempLoc(locationId);
    }
  }, [isOpen, warehouseId, floorId, zoneId, locationId, warehouses]);

  // Resolved names for display
  const currentWhName = locMap.get(warehouseId)?.name || 'SKBW';
  const currentFloorName = locMap.get(floorId)?.name || 'Ground';
  const currentZoneName = locMap.get(zoneId)?.name || 'A';
  const currentLocName = locMap.get(locationId)?.name || 'Top';

  const previewWhName = locMap.get(tempWh)?.name || currentWhName;
  const previewFloorName = locMap.get(tempFloor)?.name || currentFloorName;
  const previewZoneName = locMap.get(tempZone)?.name || currentZoneName;
  const previewLocName = locMap.get(tempLoc)?.name || currentLocName;

  // Handle cascading changes
  const handleWarehouseChange = (newWhId: string) => {
    setTempWh(newWhId);
    const floors = getFloors(newWhId);
    const nextFloorId = floors[0]?._id || '';
    setTempFloor(nextFloorId);

    const zones = getZones(nextFloorId);
    const nextZoneId = zones[0]?._id || '';
    setTempZone(nextZoneId);

    const locs = getStorageLocations(nextZoneId);
    const nextLocId = locs[0]?._id || '';
    setTempLoc(nextLocId);
  };

  const handleFloorChange = (newFloorId: string) => {
    setTempFloor(newFloorId);
    const zones = getZones(newFloorId);
    const nextZoneId = zones[0]?._id || '';
    setTempZone(nextZoneId);

    const locs = getStorageLocations(nextZoneId);
    const nextLocId = locs[0]?._id || '';
    setTempLoc(nextLocId);
  };

  const handleZoneChange = (newZoneId: string) => {
    setTempZone(newZoneId);
    const locs = getStorageLocations(newZoneId);
    const nextLocId = locs[0]?._id || '';
    setTempLoc(nextLocId);
  };

  const handleApply = () => {
    onChange(tempWh, tempFloor, tempZone, tempLoc);
    setIsOpen(false);
  };

  const colorStyles = {
    blue: {
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
      iconBg: 'bg-blue-600 text-white',
      accentText: 'text-blue-600',
      btnPrimary: 'bg-blue-600 hover:bg-blue-700'
    },
    rose: {
      badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
      iconBg: 'bg-rose-500 text-white',
      accentText: 'text-rose-600',
      btnPrimary: 'bg-rose-600 hover:bg-rose-700'
    },
    indigo: {
      badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      iconBg: 'bg-indigo-600 text-white',
      accentText: 'text-indigo-600',
      btnPrimary: 'bg-indigo-600 hover:bg-indigo-700'
    },
    emerald: {
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      iconBg: 'bg-emerald-600 text-white',
      accentText: 'text-emerald-600',
      btnPrimary: 'bg-emerald-600 hover:bg-emerald-700'
    }
  }[badgeColor];

  return (
    <div className="space-y-1.5">
      {/* Label */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(true)}
          className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>Change Location</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Trigger Box (Replaces the 4 inputs) */}
      <div
        onClick={() => !disabled && setIsOpen(true)}
        className={`w-full p-2.5 sm:p-3 bg-white border border-gray-200 hover:border-blue-400 rounded-xl transition-all cursor-pointer shadow-2xs group flex items-center justify-between gap-3 ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        title="Click to open location selector popup"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-2 rounded-lg shrink-0 ${colorStyles.badgeBg} border`}>
            <MapPin className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            {/* Breadcrumb Path */}
            <div className="flex items-center flex-wrap gap-1 text-xs font-semibold text-gray-800">
              <span className="text-gray-900 font-bold">{currentWhName}</span>
              <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-gray-600">{currentFloorName}</span>
              <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-gray-600">{currentZoneName}</span>
              <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
              <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${colorStyles.badgeBg} border`}>
                {currentLocName}
              </span>
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              Storage Bin: <span className="font-semibold text-gray-600">{currentLocName}</span> ({currentWhName} • {currentFloorName} • {currentZoneName})
            </div>
          </div>
        </div>

        {/* Change button pill */}
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          className="px-2.5 py-1 bg-gray-50 group-hover:bg-blue-50 group-hover:text-blue-700 text-gray-700 rounded-lg border border-gray-200 text-xs font-bold shrink-0 transition-colors cursor-pointer"
        >
          Select ▾
        </button>
      </div>

      {/* ── SMALL UI POP-UP MODAL ── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div 
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn space-y-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${colorStyles.badgeBg} border`}>
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Select Location</h3>
                  <p className="text-[11px] text-gray-500">Pick warehouse, floor, zone and storage bin</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Selection Path Preview */}
            <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center gap-2 text-xs">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Path:</span>
              <div className="flex items-center flex-wrap gap-1 font-semibold text-gray-800">
                <span className="text-gray-900">{previewWhName}</span>
                <ChevronRight className="w-3 h-3 text-gray-400" />
                <span className="text-gray-700">{previewFloorName}</span>
                <ChevronRight className="w-3 h-3 text-gray-400" />
                <span className="text-gray-700">{previewZoneName}</span>
                <ChevronRight className="w-3 h-3 text-gray-400" />
                <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${colorStyles.badgeBg} border`}>
                  {previewLocName}
                </span>
              </div>
            </div>

            {/* Cascading 4 Selection Controls */}
            <div className="space-y-3 text-xs">
              {/* 1. Warehouse */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-blue-600" />
                  <span>1. Warehouse / Factory</span>
                </label>
                <select
                  value={tempWh}
                  onChange={(e) => handleWarehouseChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500 shadow-2xs"
                >
                  {warehouses.map(w => (
                    <option key={w._id} value={w._id}>{w.name}</option>
                  ))}
                </select>
              </div>

              {/* 2. Floor */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-indigo-600" />
                  <span>2. Floor</span>
                </label>
                <select
                  value={tempFloor}
                  onChange={(e) => handleFloorChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500 shadow-2xs"
                >
                  {getFloors(tempWh).map(f => (
                    <option key={f._id} value={f._id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* 3. Zone */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <LayoutGrid className="w-3 h-3 text-purple-600" />
                  <span>3. Zone</span>
                </label>
                <select
                  value={tempZone}
                  onChange={(e) => handleZoneChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500 shadow-2xs"
                >
                  {getZones(tempFloor).map(z => (
                    <option key={z._id} value={z._id}>{z.name}</option>
                  ))}
                </select>
              </div>

              {/* 4. Storage Bin / Location */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <Box className="w-3 h-3 text-emerald-600" />
                  <span>4. Storage Location (Bin / Rack)</span>
                </label>
                <select
                  value={tempLoc}
                  onChange={(e) => setTempLoc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500 shadow-2xs"
                >
                  {getStorageLocations(tempZone).map(l => (
                    <option key={l._id} value={l._id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className={`px-4 py-1.5 text-xs font-bold text-white rounded-xl ${colorStyles.btnPrimary} flex items-center gap-1.5 cursor-pointer shadow-sm transition-all`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirm Location</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
