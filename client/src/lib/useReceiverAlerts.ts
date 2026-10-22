import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Catalog, OfficeRequest, User } from '../../../shared/types.js';
import { summarizeSelection } from '../../../shared/selection.js';
import { getJson } from './api';
import { socket } from './socket';
import { isSpeakerActive, onSoundReadyChange, playCallSound, playOrderSound, soundReady, unlockSound } from './sounds';

const MUTE_KEY = 'officeCall.alertsMuted';
const UNLOCK_TOAST = 'sound-unlock';

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * For receivers: plays a sound and shows a toast for every new request from someone else.
 * Returns [muted, setMuted]; the choice is remembered on this device.
 */
export function useReceiverAlerts(user: User, onView: () => void): [boolean, (muted: boolean) => void] {
  const [muted, setMutedState] = useState(loadMuted);
  const enabled = user.isStaff;

  function setMuted(next: boolean) {
    setMutedState(next);
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
    if (!next) unlockSound(); // the mute button click itself unlocks sound
  }

  // Until the browser allows sound, keep a toast with a button that turns it on.
  useEffect(() => {
    if (!enabled || muted) {
      toast.dismiss(UNLOCK_TOAST);
      return;
    }
    const show = (ready: boolean) => {
      if (ready) toast.dismiss(UNLOCK_TOAST);
      else
        toast('Turn on sound alerts', {
          id: UNLOCK_TOAST,
          description: 'Browsers need one click before they can play sound.',
          duration: Infinity,
          action: { label: 'Turn on', onClick: unlockSound },
        });
    };
    show(soundReady());
    const off = onSoundReadyChange(show);
    return () => {
      off();
    };
  }, [enabled, muted]);

  useEffect(() => {
    if (!enabled) return;
    let catalog: Catalog | null = null;
    getJson<Catalog>('/api/items')
      .then((c) => (catalog = c))
      .catch(() => {});

    const onNew = (request: OfficeRequest) => {
      if (request.userId === user.id) return; // your own request
      const isCall = request.type === 'call';
      if (!muted && !isSpeakerActive()) {
        if (isCall) playCallSound();
        else playOrderSound();
      }
      const what = isCall
        ? 'is calling staff'
        : catalog && request.selection
          ? summarizeSelection(request.selection, catalog).join(', ')
          : 'sent a request';
      toast(isCall ? `🔔 ${request.userName} is calling` : `New request from ${request.userName}`, {
        description: isCall ? undefined : what,
        duration: 8000,
        action: { label: 'View', onClick: onView },
      });
    };
    socket.on('request:new', onNew);
    return () => {
      socket.off('request:new', onNew);
    };
  }, [enabled, muted, user.id, onView]);

  return [muted, setMuted];
}
