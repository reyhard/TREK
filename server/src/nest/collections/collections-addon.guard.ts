import { ADDON_IDS } from '../../addons';
import { isAddonEnabled } from '../../services/adminService';
import { CanActivate, HttpException, Injectable } from '@nestjs/common';

/**
 * Mirrors the addon mount gate: when the Collections addon is disabled the whole
 * route group answers 404, regardless of auth. Declared before JwtAuthGuard so
 * the addon check wins over the 401, exactly as the Journey addon guard does.
 */
@Injectable()
export class CollectionsAddonGuard implements CanActivate {
  canActivate(): boolean {
    if (!isAddonEnabled(ADDON_IDS.COLLECTIONS)) {
      throw new HttpException({ error: 'Collections addon is not enabled' }, 404);
    }
    return true;
  }
}
