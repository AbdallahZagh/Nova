using NovaTaskflow.Controls;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace NovaTaskflow.ViewModels;

internal sealed class BoardDraft(string folder, string endpoint, string account, string board, string page)
{
    private readonly byte[] identity = SHA256.HashData(Encoding.UTF8.GetBytes($"{endpoint}\n{account}\n{board}\n{page}"));
    private string FileName => Path.Combine(folder, Convert.ToHexString(identity) + ".bin");

    internal BoardChange[] Read()
    {
        if (!File.Exists(FileName)) return [];
        var bytes = ProtectedData.Unprotect(File.ReadAllBytes(FileName), identity, DataProtectionScope.CurrentUser);
        return JsonSerializer.Deserialize<BoardChange[]>(bytes, BoardCanvas.JsonOptions) ?? [];
    }

    internal void Save(List<BoardChange> changes)
    {
        var path = FileName;
        if (changes.Count == 0)
        {
            File.Delete(path);
            return;
        }
        Directory.CreateDirectory(folder);
        var temporary = path + ".tmp";
        var bytes = JsonSerializer.SerializeToUtf8Bytes(changes, BoardCanvas.JsonOptions);
        File.WriteAllBytes(temporary, ProtectedData.Protect(bytes, identity, DataProtectionScope.CurrentUser));
        File.Move(temporary, path, overwrite: true);
    }
}
