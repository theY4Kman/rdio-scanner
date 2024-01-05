import { Pipe, PipeTransform } from "@angular/core";
import { formatNumber } from "@angular/common";

@Pipe({
  name: 'duration',
})
export class DurationPipe implements PipeTransform {
  transform(value?: number | null, precision: number = 1): string {
    if (value == null) {
      return '';
    }

    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = value % 60;

    const sigParts = [hours, minutes];
    if (hours === 0) {
      sigParts.shift();
    }
    if (minutes === 0) {
      sigParts.shift();
    }

    const displays = [
      ...sigParts.map((part) => formatNumber(part, 'en-US', '2.0')),
      formatNumber(seconds, 'en-US', `2.${precision}-${precision}`),
    ];

    return displays.join(':');
  }
}
