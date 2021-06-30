{#if 1}
  <div class="radioMore">
    {#if 1 === 'individual'}
      <div class="selected creation-individual">
        {#if 1 && 1}
          <label class="access-token"></label>
        {:else}
          <p>You haven't connected any accounts yet.</p>
        {/if}
      </div>
    {:else if '' === 'shared'}
      <p class="selected creation-shared">
        ​​If
      </p>
    {/if}
  </div>
{/if}