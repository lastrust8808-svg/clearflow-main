import { create } from 'zustand';
import * as types from '../types';

interface LedgerState {
  digitalAssets: types.DigitalAssetRecord[];
  assetTokenProfiles: types.AssetTokenProfile[];
  realEstateAssets: types.RealEstateAsset[];
  collateralItems: types.CollateralItem[];
  creditInstruments: types.CreditInstrument[];
  trustCertificates: types.TrustCertificate[];
  legalInstruments: types.LegalInstrument[];
  parcelRecords: types.ParcelRecord[];
  addDigitalAsset: (asset: types.DigitalAssetRecord) => void;
  setAssetTokenProfile: (profile: types.AssetTokenProfile) => void;
}

export const useLedgerStore = create<LedgerState>((set) => ({
  digitalAssets: [],
  assetTokenProfiles: [],
  realEstateAssets: [],
  collateralItems: [],
  creditInstruments: [],
  trustCertificates: [],
  legalInstruments: [],
  parcelRecords: [],
  addDigitalAsset: (asset) =>
    set((state) => ({
      digitalAssets: [...state.digitalAssets, asset],
    })),
  setAssetTokenProfile: (profile) =>
    set((state) => {
      const existingIndex = state.assetTokenProfiles.findIndex(
        (p) => p.assetId === profile.assetId
      );
      if (existingIndex >= 0) {
        const newProfiles = [...state.assetTokenProfiles];
        newProfiles[existingIndex] = profile;
        return { assetTokenProfiles: newProfiles };
      }
      return { assetTokenProfiles: [...state.assetTokenProfiles, profile] };
    }),
}));
