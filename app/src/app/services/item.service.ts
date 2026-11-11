import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { tap, type Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { ApiResponse, Item, ItemFilters, ItemStatus, NewItem } from '../models/item.model';

// Where this phone keeps the owner tokens of the reports it submitted ({ "12": "token" }).
// One list per server: report ids restart at 1 on every database, so a token saved while the
// app used the PC's XAMPP server must not count for report 1 on the online server.
const OWNER_TOKENS_KEY = `lostfound.ownerTokens@${environment.apiUrl}`;

@Injectable({ providedIn: 'root' })
export class ItemService {
  private http = inject(HttpClient);
  private url = environment.apiUrl;

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

    // No Content-Type header here: the browser adds multipart/form-data with the boundary itself.
    return this.http.post<ApiResponse<Item>>(this.url, form).pipe(
      tap((result) => {
        if (result.data?.owner_token) {
          this.saveOwnerToken(result.data.id, result.data.owner_token);
        }
      }),
    );
  }

  // PUT /api/items.php?id=N: mark a report resolved, or reopen it. Only works from the phone
  // that submitted it, because only that phone has the report's owner token.
  setStatus(id: number, status: ItemStatus): Observable<ApiResponse<Item>> {
    const body = { status, owner_token: this.readOwnerTokens()[id] ?? '' };
    return this.http.put<ApiResponse<Item>>(this.url, body, { params: { id } });
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
}
