<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { getSettings } from '@/storage/items';
import { getSyncState, remoteCopy, startSync, stopSync, watchSyncState } from '@/storage/sync';

const enabled = ref(false);
const busy = ref(false);
/** Set when turning sync on finds another device's copy: the user picks which data wins. */
const choice = ref<{ at: string } | null>(null);
const state = ref<Awaited<ReturnType<typeof getSyncState>> | null>(null);
const confirmOff = ref(false);

async function load() {
  enabled.value = (await getSettings()).syncEnabled;
  state.value = await getSyncState();
}
let unwatch: (() => void) | null = null;
onMounted(() => {
  void load();
  unwatch = watchSyncState(() => void load());
});
onUnmounted(() => unwatch?.());

async function turnOn() {
  busy.value = true;
  try {
    const remote = await remoteCopy();
    if (remote) choice.value = remote;
    else await finish('local');
  } finally {
    busy.value = false;
  }
}

async function finish(use: 'remote' | 'local') {
  busy.value = true;
  choice.value = null;
  try {
    await startSync(use);
  } finally {
    busy.value = false;
    await load();
  }
}

async function turnOff(removeCopy: boolean) {
  confirmOff.value = false;
  await stopSync(removeCopy);
  await load();
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="sync">
    <h3 class="font-medium">Sync across devices</h3>
    <p class="text-[13px] text-graphite-2">
      Keeps your settings, profile, standard answers, stories, cover letter, and tracked
      applications the same on every computer where you're signed in to Chrome. It goes through your
      Google account's Chrome Sync. API keys, resume and website sources, and saved answers stay on
      each device.
    </p>

    <template v-if="!enabled">
      <div v-if="choice" class="notice flex flex-col gap-2" data-testid="sync-choice">
        <p>
          Your account already has synced data from another device ({{ when(choice.at) }}). Which
          should this computer use?
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-primary"
            type="button"
            data-testid="sync-use-remote"
            @click="finish('remote')"
          >
            Use the synced data here
          </button>
          <button class="btn" type="button" data-testid="sync-use-local" @click="finish('local')">
            Keep this computer's data
          </button>
        </div>
        <p class="text-[12.5px]">Tracked applications from both are kept either way.</p>
      </div>
      <button
        v-else
        class="btn self-start"
        type="button"
        :disabled="busy"
        data-testid="sync-on"
        @click="turnOn"
      >
        Turn on sync
      </button>
    </template>

    <template v-else>
      <p class="success self-start text-[13px]" role="status" data-testid="sync-status">
        Sync is on.
        <template v-if="state?.lastSync">Last synced {{ when(state.lastSync) }}.</template>
      </p>
      <p v-if="state?.error" class="notice text-[13px]" role="alert">{{ state.error }}</p>
      <div v-if="confirmOff" class="flex flex-wrap items-center gap-2 text-[13px]">
        <button class="btn" type="button" data-testid="sync-off-keep" @click="turnOff(false)">
          Turn off, keep the synced copy
        </button>
        <button class="btn" type="button" data-testid="sync-off-remove" @click="turnOff(true)">
          Turn off and delete the synced copy
        </button>
      </div>
      <button
        v-else
        class="btn btn-quiet self-start"
        type="button"
        data-testid="sync-off"
        @click="confirmOff = true"
      >
        Turn off sync
      </button>
    </template>
  </div>
</template>
