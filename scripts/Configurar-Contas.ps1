# Run locally. Nothing entered here is written to the repository or printed.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ProjectUrl)
$ErrorActionPreference = 'Stop'
$ProjectUrl = $ProjectUrl.TrimEnd('/')
if ($ProjectUrl -notmatch '^https://[a-z0-9-]+\.supabase\.co$') { throw 'Use a URL HTTPS do projeto Supabase.' }
function Reveal([Security.SecureString]$Value) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$adminSecret = Read-Host 'Chave administrativa (service_role ou secret; entrada oculta)' -AsSecureString
$adminKey = Reveal $adminSecret
$headers = @{ apikey=$adminKey }
if ($adminKey.StartsWith('eyJ')) { $headers.Authorization="Bearer $adminKey" }
function Api([string]$Method, [string]$Path, $Body=$null) {
    $request = @{ Uri="$ProjectUrl$Path"; Method=$Method; Headers=$headers; ContentType='application/json'; UserAgent='Peleja-Admin/25.0' }
    if ($null -ne $Body) { $request.Body=[Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 20 -Compress)) }
    try { Invoke-RestMethod @request }
    catch { throw "Falha na operação administrativa ($Method $Path). Confira o projeto, a chave e os dois arquivos SQL. Nenhuma senha será exibida." }
}
try {
    $roster = @(Api GET '/rest/v1/account_handles?select=user_id,username,active')
    $users = @()
    for ($page=1; ; $page++) {
        $batch = Api GET "/auth/v1/admin/users?page=$page&per_page=100"
        $users += @($batch.users)
        if (@($batch.users).Count -lt 100) { break }
    }
    $names = [ordered]@{ vinicius='Vinícius'; wilton='Wilton'; ulisses='Ulisses'; jonas='Jonas'; tiago='Tiago' }
    foreach ($username in $names.Keys) {
        $email = "$username@peleja.invalid"
        $user = $users | Where-Object { $_.email -eq $email } | Select-Object -First 1
        $handle = $roster | Where-Object { $_.username -eq $username } | Select-Object -First 1
        if ($handle -and (!$user -or $handle.user_id -ne $user.id)) {
            throw "O perfil $username já está ligado a outra identidade. Interrompido para preservar o histórico."
        }
        if ($handle -and !$handle.active) { throw "O perfil $username está desativado. Não será reativado automaticamente." }
        if (!$user) {
            $password = Reveal (Read-Host "Escolha a senha de $($names[$username]) (mínimo 12 caracteres)" -AsSecureString)
            $repeat = Reveal (Read-Host 'Repita a senha' -AsSecureString)
            if ($password.Length -lt 12 -or $password -cne $repeat) { throw 'Senhas diferentes ou curtas. Execute novamente; contas já criadas serão preservadas.' }
            $created = Api POST '/auth/v1/admin/users' @{email=$email;password=$password;email_confirm=$true;user_metadata=@{display_name=$names[$username]}}
            $user = if ($created.user) { $created.user } else { $created }
            $password=$null; $repeat=$null
        }
        if (!$user.id) { throw "Não foi possível confirmar a identidade de $username." }
        $headers.Prefer='resolution=merge-duplicates,return=minimal'
        $role = if ($username -eq 'vinicius') { 'admin' } else { 'member' }
        Api POST '/rest/v1/profiles?on_conflict=id' @{id=$user.id;display_name=$names[$username];role=$role} | Out-Null
        Api POST '/rest/v1/account_handles?on_conflict=user_id' @{user_id=$user.id;username=$username;active=$true} | Out-Null
        Write-Host "$($names[$username]): perfil confirmado. Senha existente preservada quando a conta já existia."
    }
    Write-Host 'Cinco perfis configurados. Mantenha o cadastro público desativado no Supabase.'
} finally {
    $password=$null; $repeat=$null; $adminKey=$null; $headers.Clear(); $adminSecret.Dispose()
}
