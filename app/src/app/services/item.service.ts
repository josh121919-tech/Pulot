import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { tap, type Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { ApiResponse, Claim, Item, ItemFilters, ItemStatus, NewItem } from '../models/item.model';

const OWNER_TOKENS_KEY = `lostfound.ownerTokens@${environment.apiUrl}`;
const MY_CLAIMS_KEY = `lostfound.myClaims@${environment.apiUrl}`;

@Injectable({ providedIn: 'root' })
export class ItemService {
  private http = inject(HttpClient);
  private url = environment.apiUrl;
  private claimsUrl = environment.apiUrl.replace(/items\.php$/, 'claims.php');

  getItems(filters: ItemFilters = {}): Observable<ApiResponse<Item[]>> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params[key] = value;
      }
    }
    return this.http.get<ApiResponse<Item[]>>(this.url, { params });
  }

  createItem(item: NewItem, photo: Blob | null): Observable<ApiResponse<Item>> {
    return this.http.post<ApiResponse<Item>>(this.url, this.toForm(item, photo)).pipe(
      tap((result) => {
        if (result.data?.owner_token) {
          this.saveOwnerToken(result.data.id, result.data.owner_token);
        }
      }),
    );
  }

  updateItem(id: number, item: NewItem, photo: Blob | null, removePhoto: boolean): Observable<ApiResponse<Item>> {
    const form = this.toForm(item, photo);
    form.append('owner_token', this.readOwnerTokens()[id] ?? '');
    if (removePhoto && !photo) {
      form.append('remove_photo', '1');
    }
    return this.http.post<ApiResponse<Item>>(this.url, form, { params: { id } });
  }

  deleteItem(id: number): Observable<ApiResponse<null>> {
    const body = { owner_token: this.readOwnerTokens()[id] ?? '' };
    return this.http
      .delete<ApiResponse<null>>(this.url, { params: { id }, body })
      .pipe(tap(() => this.forgetOwnerToken(id)));
  }

  setStatus(id: number, status: ItemStatus): Observable<ApiResponse<Item>> {
    const body = { status, owner_token: this.readOwnerTokens()[id] ?? '' };
    return this.http.put<ApiResponse<Item>>(this.url, body, { params: { id } });
  }

  reportFound(id: number, foundContact: string): Observable<ApiResponse<Item>> {
    return this.http.put<ApiResponse<Item>>(this.url, { found_contact: foundContact }, { params: { id } });
  }

  claimItem(id: number, contact: string, proof: string): Observable<ApiResponse<null>> {
    return this.http
      .post<ApiResponse<null>>(this.claimsUrl, { contact, proof }, { params: { item_id: id } })
      .pipe(tap(() => this.saveMyClaim(id)));
  }

  getClaims(id: number): Observable<ApiResponse<Claim[]>> {
    return this.http.get<ApiResponse<Claim[]>>(this.claimsUrl, {
      params: { item_id: id },
      headers: { 'X-Owner-Token': this.readOwnerTokens()[id] ?? '' },
    });
  }

  hasClaimed(id: number): boolean {
    return this.readMyClaims().includes(id);
  }

  hasReports(): boolean {
    return Object.keys(this.readOwnerTokens()).length > 0;
  }

  isMine(id: number): boolean {
    return Boolean(this.readOwnerTokens()[id]);
  }

  describeError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return 'Cannot reach the server. Check your internet connection and try again.';
      }
      const body = err.error as ApiResponse<unknown> | null;
      if (body?.errors) {
        return Object.values(body.errors).join(' ');
      }
      if (body?.message) {
        return body.message;
      }
    }
    return 'Something went wrong. Please try again.';
  }

  private toForm(item: NewItem, photo: Blob | null): FormData {
    const form = new FormData();
    form.append('title', item.title);
    form.append('description', item.description);
    form.append('type', item.type);
    form.append('category', item.category);
    form.append('latitude', String(item.latitude));
    form.append('longitude', String(item.longitude));
    form.append('contact_info', item.contact_info);
    if (photo) {
      const extension = photo.type.split('/')[1] || 'jpg';
      form.append('photo', photo, `photo.${extension}`);
    }
    return form;
  }

  private readOwnerTokens(): Record<string, string> {
    try {
      const stored = JSON.parse(localStorage.getItem(OWNER_TOKENS_KEY) ?? '{}') as unknown;
      return stored && typeof stored === 'object' ? (stored as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  private saveOwnerToken(id: number, token: string): void {
    try {
      localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify({ ...this.readOwnerTokens(), [id]: token }));
    } catch {
    }
  }

  private readMyClaims(): number[] {
    try {
      const stored = JSON.parse(localStorage.getItem(MY_CLAIMS_KEY) ?? '[]') as unknown;
      return Array.isArray(stored) ? stored.filter((id): id is number => typeof id === 'number') : [];
    } catch {
      return [];
    }
  }

  private saveMyClaim(id: number): void {
    try {
      localStorage.setItem(MY_CLAIMS_KEY, JSON.stringify([...new Set([...this.readMyClaims(), id])]));
    } catch {
    }
  }

  private forgetOwnerToken(id: number): void {
    try {
      const tokens = this.readOwnerTokens();
      delete tokens[id];
      localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify(tokens));
    } catch {
    }
  }
}
