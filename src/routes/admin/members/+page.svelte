<script lang="ts">
  import AdminMemberManager from '$lib/components/admin/members/AdminMemberManager.svelte';
  import '$lib/styles/admin-content-management.css';
  import '$lib/styles/admin-member-management.css';
  let { data } = $props();
</script>

<svelte:head><title>Quản lý thành viên — Tu Tập Phật Pháp</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<AdminMemberManager initialMembers={data.members} />
