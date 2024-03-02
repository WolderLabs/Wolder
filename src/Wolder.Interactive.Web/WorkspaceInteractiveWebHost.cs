namespace Wolder.Interactive.Web;

public class WorkspaceInteractiveWebHost
{
    private WebApplication? _app;
    private Task? _serverInitializeTask;

    public WorkspaceInteractiveWebHost()
    {
        WorkspaceStateNotifications.WorkspaceInitialized += () =>
        {
            _serverInitializeTask = StartAsync();
        };
    }

    public WorkspaceStateNotifications WorkspaceStateNotifications { get; } = new();

    private async Task StartAsync()
    {
        if (_serverInitializeTask is not null)
        {
            await _serverInitializeTask;
            return;
        }
        
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