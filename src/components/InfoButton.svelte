<script lang="ts">
  import { GLOSSARY, type Term } from '../lib/glossary';
  import BottomSheet from './BottomSheet.svelte';
  import Icon from './Icon.svelte';

  let { term }: { term: Term } = $props();
  let open = $state(false);
  const entry = $derived(GLOSSARY[term]);
</script>

<button
  type="button"
  class="-m-2.5 inline-grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-fg"
  aria-label="What is {entry.title}?"
  onclick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    open = true;
  }}>
  <Icon name="info" size={18} />
</button>

<BottomSheet bind:open title={entry.title}>
  <p class="text-base">{entry.text}</p>
</BottomSheet>
