using Windows.Security.Credentials;
using NovaTaskflow.Shell;

namespace NovaTaskflow.Auth;

internal static class SessionVault
{
    private const string Resource = "Nova Taskflow";

    internal static string Key(string server, string account) => server + "|" + account +
        (DesktopSettings.TestFolder is null ? "" : "|" + DesktopSettings.TestFolder);

    public static string? Read(string key)
    {
        try
        {
            var credential = new PasswordVault().Retrieve(Resource, key);
            credential.RetrievePassword();
            return credential.Password;
        }
        catch (Exception error) when (error.HResult == unchecked((int)0x80070490)) { return null; }
    }

    public static void Save(string key, string token)
    {
        Clear(key);
        new PasswordVault().Add(new PasswordCredential(Resource, key, token));
    }

    public static void Clear(string key)
    {
        try
        {
            var vault = new PasswordVault();
            vault.Remove(vault.Retrieve(Resource, key));
        }
        catch (Exception error) when (error.HResult == unchecked((int)0x80070490)) { }
    }
}
