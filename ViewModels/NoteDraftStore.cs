using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace NovaTaskflow.ViewModels;

internal sealed record StoredNote(Guid Key, NoteDocument Value, string[] Fields, bool NeedsCreateReview);

internal sealed class NoteDraftStore(string folder, string endpoint, string account)
{
    private static readonly JsonSerializerOptions Format = new(JsonSerializerDefaults.Web);
    private readonly byte[] identity = SHA256.HashData(Encoding.UTF8.GetBytes($"{endpoint}\n{account}"));
    private string AccountFolder => Path.Combine(folder, Convert.ToHexString(identity));
    private string FileName(Guid id) => Path.Combine(AccountFolder, id.ToString("N") + ".bin");

    internal IEnumerable<StoredNote> Read()
    {
        if (!Directory.Exists(AccountFolder)) yield break;
        foreach (var path in Directory.EnumerateFiles(AccountFolder, "*.bin"))
        {
            var bytes = ProtectedData.Unprotect(File.ReadAllBytes(path), identity, DataProtectionScope.CurrentUser);
            if (JsonSerializer.Deserialize<StoredNote>(bytes, Format) is { } note) yield return note;
        }
    }

    internal void Write(StoredNote note)
    {
        if (note.Fields.Length == 0) { Remove(note.Key); return; }
        Directory.CreateDirectory(AccountFolder);
        var path = FileName(note.Key);
        var temporary = path + ".new";
        var bytes = JsonSerializer.SerializeToUtf8Bytes(note, Format);
        File.WriteAllBytes(temporary, ProtectedData.Protect(bytes, identity, DataProtectionScope.CurrentUser));
        File.Move(temporary, path, overwrite: true);
    }

    internal void Remove(Guid id)
    {
        if (Directory.Exists(AccountFolder)) File.Delete(FileName(id));
    }
}
