using DurableTask.Core;
using Microsoft.Extensions.DependencyInjection;

namespace Wolder.Core.Workspace.DurableTaskInterop;

class ServiceProviderCreator<T> : ObjectCreator<T>
{
    readonly Type prototype;
    readonly Func<IServiceProvider> serviceProviderFactory;

    public ServiceProviderCreator(Type type, Func<IServiceProvider> serviceProvider)
    {
        this.prototype = type;
        this.serviceProviderFactory = serviceProvider;
        Initialize(type);
    }

    public override T Create()
    {
        return (T)serviceProviderFactory().GetRequiredService(this.prototype);
    }

    void Initialize(object obj)
    {
        Name = NameVersionHelper.GetDefaultName(obj);
        Version = NameVersionHelper.GetDefaultVersion(obj);
    }
}