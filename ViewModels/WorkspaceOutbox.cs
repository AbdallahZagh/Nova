using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace NovaTaskflow.ViewModels;

internal sealed record InitialSubtask(string Title, string? DueDate, bool Done, string[] Assignees);

internal sealed record InitialProjectMember(string UserId, string Role);

internal sealed record PendingChange(Guid Id, string Method, string Path, string Label, JsonElement Fields,
    Dictionary<string, JsonElement> Base, string[] Assignees, string? SavedId = null, string? Review = null, string? ParentTask = null, InitialSubtask[]? Setup = null, InitialProjectMember[]? ProjectTeam = null);

internal sealed class WorkspaceOutbox(string folder, string endpoint, string account)
{
    private static readonly JsonSerializerOptions Format = new(JsonSerializerDefaults.Web);
    private readonly byte[] identity = SHA256.HashData(Encoding.UTF8.GetBytes($"{endpoint}\n{account}"));
    private string FileName => Path.Combine(folder, Convert.ToHexString(identity) + ".bin");

    internal List<PendingChange> Read()
    {
        if (!File.Exists(FileName)) return [];
        var bytes = ProtectedData.Unprotect(File.ReadAllBytes(FileName), identity, DataProtectionScope.CurrentUser);
        return JsonSerializer.Deserialize<List<PendingChange>>(bytes, Format)
            ?? throw new JsonException("Nova could not read the saved workspace changes.");
    }

    internal void Write(List<PendingChange> changes)
    {
        if (changes.Count == 0)
        {
            File.Delete(FileName);
            return;
        }
        Directory.CreateDirectory(folder);
        var temporary = FileName + ".new";
        var bytes = JsonSerializer.SerializeToUtf8Bytes(changes, Format);
        File.WriteAllBytes(temporary, ProtectedData.Protect(bytes, identity, DataProtectionScope.CurrentUser));
        File.Move(temporary, FileName, overwrite: true);
    }
}
