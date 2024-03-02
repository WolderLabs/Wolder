namespace Wolder.Interactive.Web;

public class WolderInteractiveHost()
{
    private WebApplication? _app;

    public async Task StartAsync()
    {
        var webBuilder = WebApplication.CreateBuilder();

        // Add services to the container.
        webBuilder.Services.AddRazorComponents()
            .AddInteractiveServerComponents();

        _app = webBuilder.Build();

        _app.UseExceptionHandler("/Error", createScopeForErrors: true);

        _app.UseHttpsRedirection();

        _app.UseStaticFiles();
        _app.UseAntiforgery();

        _app.MapRazorComponents<App>()
            .AddInteractiveServerRenderMode();

        await _app.StartAsync();
    }
    
    public async Task StopAsync()
    {
        if (_app is null)
        {
            return;
        }
        await _app.StopAsync();
    }
}