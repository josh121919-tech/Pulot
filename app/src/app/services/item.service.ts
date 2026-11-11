import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { tap, type Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { ApiResponse, Claim, Item, ItemFilters, ItemStatus, NewItem } from '../models/item.model';

// Where this phone keeps the owner tokens of the reports it submitted ({ "12": "token" }).
// One list per server: report ids restart at 1 on every database, so a token saved while the
// app used the PC's XAMPP server must not count for report 1 on the online server.
const OWNER_TOKENS_KEY = `lostfound.ownerTokens@${environment.apiUrl}`;
// The Found reports this phone has claimed ("This is mine"), so it does not offer to claim twice.
const MY_CLAIMS_KEY = `lostfound.myClaims@${environment.apiUrl}`;

@Injectable({ providedIn: 'root' })
export class ItemService {
  private http = inject(HttpClient);
  private url = environment.apiUrl;
  // claims.php sits next to items.php on the same server.
  private claimsUrl = environment.apiUrl.replace(/items\.php$/, 'claims.php');

  // GET /api/items.php with only the filters that are set, e.g. ?type=lost&category=Keys&q=red.
  getItems(filters: ItemFilters = {}): Observable<ApiResponse<Item[]>> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params[key] = value;
      }
    }
    return this.http.get<ApiResponse<Item[]>>(this.url, { params });
  }

  // POST /api/items.php as multipart/form-data so the photo can travel with the text fields.
  createItem(item: NewItem, photo: Blob | null): Observable<ApiResponse<Item>> {
    // No Content-Type header here: the browser adds multipart/form-data with the boundary itself.
    return this.http.post<ApiResponse<Item>>(this.url, this.toForm(item, photo)).pipe(
      tap((result) => {
        if (result.data?.owner_token) {
          this.saveOwnerToken(result.data.id, result.data.owner_token);
        }
      }),
    );
  }

  // POST /api/items.php?id=N: edit a report this phone submitted. A new photo replaces the
  // old one; removePhoto drops the old one without a replacement.
  updateItem(id: number, item: NewItem, photo: Blob | null, removePhoto: boolean): Observable<ApiResponse<Item>> {
    const form = this.toForm(item, photo);
    form.append('owner_token', this.readOwnerTokens()[id] ?? '');
    if (removePhoto && !photo) {
      form.append('remove_photo', '1');
    }
    return this.http.post<ApiResponse<Item>>(this.url, form, { params: { id } });
  }

  // DELETE /api/items.php?id=N: removes a report this phone submitted, and its photo.
  deleteItem(id: number): Observable<ApiResponse<null>> {
    const body = { owner_token: this.readOwnerTokens()[id] ?? '' };
    return this.http
      .delete<ApiResponse<null>>(this.url, { params: { id }, body })
      .pipe(tap(() => this.forgetOwnerToken(id)));
  }

  // PUT /api/items.php?id=N: mark a report resolved, or reopen it. Only works from the phone
  // that submitted it, because only that phone has the report's owner token.
  setStatus(id: number, status: ItemStatus): Observable<ApiResponse<Item>> {
    const body = { status, owner_token: this.readOwnerTokens()[id] ?? '' };
    return this.http.put<ApiResponse<Item>>(this.url, body, { params: { id } });
  }

  // PUT /api/items.php?id=N with { found_contact }: someone who found a Lost item tells the
  // owner how to reach them. No token: anyone who has the item can say so.
  reportFound(id: number, foundContact: string): Observable<ApiResponse<Item>> {
    return this.http.put<ApiResponse<Item>>(this.url, { found_contact: foundContact }, { params: { id } });
  }

  // POST /api/claims.php?item_id=N: "This is mine" on someone else's open Found report.
  claimItem(id: number, contact: string, proof: string): Observable<ApiResponse<null>> {
    return this.http
      .post<ApiResponse<null>>(this.claimsUrl, { contact, proof }, { params: { item_id: id } })
      .pipe(tap(() => this.saveMyClaim(id)));
  }

  // GET /api/claims.php?item_id=N: the claims on a report this phone posted. The owner token
  // goes in a header, so the private proofs are only sent to the poster.
  getClaims(id: number): Observable<ApiResponse<Claim[]>> {
    return this.http.get<ApiResponse<Claim[]>>(this.claimsUrl, {
      params: { item_id: id },
      headers: { 'X-Owner-Token': this.readOwnerTokens()[id] ?? '' },
    });
  }

  // True when this phone has already claimed the report.
  hasClaimed(id: number): boolean {
    return this.readMyClaims().includes(id);
  }

  // True when this phone has submitted at least one report to this server.
  hasReports(): boolean {
    return Object.keys(this.readOwnerTokens()).length > 0;
  }

  // True when this phone submitted the report and can change its status.
  isMine(id: number): boolean {
    return Boolean(this.readOwnerTokens()[id]);
  }

  // Turns an HTTP error into one sentence the user can act on.
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

  // localStorage lives in the app's own storage on the phone; it is lost only if the
  // app's data is cleared or the app is uninstalled.
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
      // Storage full or blocked: the report is still saved, it just can't be resolved from here.
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
      // Storage blocked: the server still refuses a second claim from the same contact.
    }
  }

  private forgetOwnerToken(id: number): void {
    try {
      const tokens = this.readOwnerTokens();
      delete tokens[id];
      localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify(tokens));
    } catch {
      // Nothing to do: the report is already gone from the server.
    }
  }
}
