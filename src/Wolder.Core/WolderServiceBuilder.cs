using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;

namespace Wolder.Core;

public sealed record WolderServiceBuilder(IServiceCollection Services, IConfigurationSection Config)
{
}
