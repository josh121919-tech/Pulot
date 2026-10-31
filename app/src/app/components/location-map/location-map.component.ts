import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Component, ViewEncapsulation, effect, input, output, viewChild } from '@angular/core';
import * as L from 'leaflet';

import type { ItemType } from '../../models/item.model';

export interface LatLng {
  latitude: number;
  longitude: number;
}

// A Leaflet map with one pin. Used read-only in the item details, and with
// `draggable` on the Report page so the user can correct the GPS position.
@Component({
  selector: 'app-location-map',
  template: '<div #map class="location-map" role="application" aria-label="Map showing the item location"></div>',
  styleUrls: ['location-map.component.scss'],
  // Leaflet creates the pin and tiles outside Angular's view, so the styles must be global.
  encapsulation: ViewEncapsulation.None,
})
export class LocationMapComponent implements AfterViewInit, OnDestroy {
  latitude = input.required<number>();
  longitude = input.required<number>();
  type = input<ItemType>('lost');
  draggable = input(false);
  positionChange = output<LatLng>();

  private mapElement = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private map?: L.Map;
  private marker?: L.Marker;
  private resizeObserver?: ResizeObserver;

  constructor() {
    // When the parent passes new coordinates (e.g. a new GPS fix), move the pin there.
    effect(() => {
      const position: L.LatLngTuple = [this.latitude(), this.longitude()];
      if (this.map && this.marker) {
        this.marker.setLatLng(position);
        this.map.panTo(position);
      }
    });

    // Recolour the pin if the Report form switches between Lost and Found.
    effect(() => {
      this.marker?.setIcon(this.pinIcon(this.type()));
    });
  }

  ngAfterViewInit(): void {
    const position: L.LatLngTuple = [this.latitude(), this.longitude()];

    this.map = L.map(this.mapElement().nativeElement).setView(position, 17);

    // OpenStreetMap tiles (free; the attribution line is required by their licence).
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    this.marker = L.marker(position, { icon: this.pinIcon(this.type()), draggable: this.draggable() }).addTo(this.map);

    if (this.draggable()) {
      // Drag the pin, or tap anywhere on the map, to set the location by hand.
      this.marker.on('dragend', () => this.emitPosition(this.marker!.getLatLng()));
      this.map.on('click', (event: L.LeafletMouseEvent) => {
        this.marker!.setLatLng(event.latlng);
        this.emitPosition(event.latlng);
      });
    }

    // Ionic pages and modals animate in, so the map's size is not final at this point.
    // Re-measure whenever the container changes size, otherwise tiles render grey.
    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
    this.resizeObserver.observe(this.mapElement().nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  // Custom pin drawn with CSS, red for lost and green for found. Avoids Leaflet's
  // default marker images, whose file paths break when Angular bundles the app.
  private pinIcon(type: ItemType): L.DivIcon {
    return L.divIcon({
      className: '',
      html: `<div class="map-pin map-pin--${type}"></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 36], // the rotated tip sits ~21px below the pin's centre
    });
  }

  private emitPosition(latlng: L.LatLng): void {
    this.positionChange.emit({ latitude: latlng.lat, longitude: latlng.lng });
  }
}
